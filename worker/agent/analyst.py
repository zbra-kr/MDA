"""
LLM 분석 파이프라인 (Phase 2.1 단계 E-3).

anomalies(analyzed=false) → 매칭 조회 → 프롬프트 → OllamaClient → validators
→ agent_analyses INSERT + anomalies.analyzed=true.

환각 발견 시 분석 폐기, analyzed=false 유지 (다음 날 재시도).
"""

from __future__ import annotations

import asyncio
import os
from datetime import date, datetime, timezone

from loguru import logger
from supabase import Client

from worker.agent.llm_client import LLMClient
from worker.agent.prompts import PROMPT_VERSION, SYSTEM_PROMPT, build_user_prompt
from worker.agent.validators import validate_output

DAILY_LIMIT  = 50   # 일 최대 분석 건수 (severity 내림차순)
LLM_MODEL    = os.environ.get("OLLAMA_MODEL", "gemma4:e4b")
MAX_RETRIES  = 2    # JSON 파싱 실패 시 재시도 횟수 (hint 추가)


# ─── 데이터 조회 ─────────────────────────────────────────────────────────────


def _fetch_pending_anomalies(sb: Client, target_date: date) -> list[dict]:
    resp = (
        sb.table("anomalies")
        .select(
            "id, product_id, anomaly_type, severity, evidence, detected_on, "
            "products(id, name, current_price, list_price, review_count, musinsa_no, brand_id, "
            "brands(id, name, slug))"
        )
        .eq("detected_on", target_date.isoformat())
        .eq("analyzed", False)
        .order("severity", desc=True)
        .limit(DAILY_LIMIT)
        .execute()
    )
    return resp.data or []


def _fetch_matches(sb: Client, product_id: str) -> list[dict]:
    resp = (
        sb.table("product_matches")
        .select("id, similarity_score, match_method, diff_summary, own_skus(id, sku_code, product_name, price)")
        .eq("competitor_product_id", product_id)
        .eq("is_active", True)
        .order("similarity_score", desc=True)
        .limit(3)
        .execute()
    )
    rows = resp.data or []
    result: list[dict] = []
    for r in rows:
        sku = r.get("own_skus") or {}
        result.append({
            "sku_code":       sku.get("sku_code"),
            "product_name":   sku.get("product_name"),
            "similarity_score": r.get("similarity_score"),
            "diff_summary":   r.get("diff_summary") or {},
        })
    return result


# ─── DB 적재 ─────────────────────────────────────────────────────────────────


def _insert_analysis(
    sb: Client,
    anomaly_id: str,
    model_version: str,
    strategy: dict,
    reasoning: str,
    tokens_in: int,
    tokens_out: int,
    latency_ms: int,
) -> None:
    sb.table("agent_analyses").insert({
        "anomaly_id":              anomaly_id,
        "model_version":           model_version,
        "prompt_version":          PROMPT_VERSION,
        "llm_reasoning":           reasoning,
        "strategy_recommendation": strategy,
        "tokens_in":               tokens_in,
        "tokens_out":              tokens_out,
        "latency_ms":              latency_ms,
        "created_at":              datetime.now(tz=timezone.utc).isoformat(),
    }).execute()


def _mark_analyzed(sb: Client, anomaly_id: str) -> None:
    sb.table("anomalies").update({"analyzed": True}).eq("id", anomaly_id).execute()


# ─── 단일 anomaly 분석 ───────────────────────────────────────────────────────


async def analyze_one(
    sb: Client,
    llm: LLMClient,
    anomaly_row: dict,
    dry_run: bool,
) -> bool:
    """단일 anomaly 분석. 성공 시 True, 실패/환각 시 False."""
    anomaly_id = anomaly_row["id"]
    product    = anomaly_row.get("products") or {}
    brand      = product.get("brands") or {}
    product_id = anomaly_row["product_id"]
    model      = LLM_MODEL

    matches  = _fetch_matches(sb, product_id)
    valid_skus = {m["sku_code"] for m in matches if m.get("sku_code")}

    anomaly_data = {
        "anomaly_type": anomaly_row["anomaly_type"],
        "severity":     anomaly_row["severity"],
        "evidence":     anomaly_row.get("evidence") or {},
        "detected_on":  anomaly_row["detected_on"],
    }
    product_data = {
        "name":          product.get("name"),
        "current_price": product.get("current_price"),
        "list_price":    product.get("list_price"),
        "review_count":  product.get("review_count"),
        "musinsa_no":    product.get("musinsa_no"),
    }

    strategy: dict | None = None
    raw_text: str = ""
    tokens_in = tokens_out = latency_ms = 0

    for attempt in range(1, MAX_RETRIES + 1):
        user_prompt = build_user_prompt(
            anomaly  = anomaly_data,
            product  = product_data,
            brand    = brand,
            matches  = matches,
            hint     = (attempt > 1),
        )

        if hasattr(llm, "complete_with_usage"):
            raw_text, tokens_in, tokens_out, latency_ms = await llm.complete_with_usage(
                system=SYSTEM_PROMPT,
                user=user_prompt,
                model=model,
            )
        else:
            raw_text = await llm.complete(
                system=SYSTEM_PROMPT,
                user=user_prompt,
                model=model,
            )

        if not raw_text:
            logger.bind(anomaly_id=anomaly_id, attempt=attempt).warning("analyze_one: LLM 무응답")
            continue

        strategy = validate_output(
            raw=raw_text,
            valid_skus=valid_skus,
            anomaly_id=anomaly_id,
            attempt=attempt,
        )
        if strategy is not None:
            break

    if strategy is None:
        logger.bind(anomaly_id=anomaly_id).warning("analyze_one: 분석 폐기 (환각/파싱 실패)")
        return False

    if not dry_run:
        _insert_analysis(
            sb=sb,
            anomaly_id=anomaly_id,
            model_version=model,
            strategy=strategy,
            reasoning=raw_text,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency_ms,
        )
        _mark_analyzed(sb, anomaly_id)

    logger.bind(
        anomaly_id=anomaly_id,
        action=strategy.get("action"),
        priority=strategy.get("priority"),
        latency_ms=latency_ms,
    ).info("analyze_one_ok")
    return True


# ─── 배치 실행 ───────────────────────────────────────────────────────────────


async def run_analysis(
    sb: Client,
    llm: LLMClient,
    target_date: date,
    dry_run: bool,
) -> dict[str, int]:
    stats = {"total": 0, "success": 0, "failed": 0}

    rows = _fetch_pending_anomalies(sb, target_date)
    stats["total"] = len(rows)

    if not rows:
        logger.info(f"run_analysis: {target_date} 분석 대상 없음")
        return stats

    logger.info(f"run_analysis: {len(rows)}건 분석 시작 (model={LLM_MODEL})")

    # 순차 처리 — GPU 메모리 관리 (동시 LLM 호출 금지)
    for row in rows:
        ok = await analyze_one(sb, llm, row, dry_run)
        if ok:
            stats["success"] += 1
        else:
            stats["failed"] += 1

    logger.bind(**stats).info("run_analysis_done")
    return stats
