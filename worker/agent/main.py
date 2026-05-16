"""
worker.agent — LLM 분석 CLI (Phase 2.1 단계 E-4).

사용법:
    python -m worker.agent.main --mode analyze --date 2026-05-17 --provider ollama
    python -m worker.agent.main --mode analyze --date 2026-05-17 --provider ollama --dry-run
    python -m worker.agent.main --mode analyze --date 2026-05-17 --provider anthropic --model claude-haiku-4-5-20251001

exit code:
    0 — 전체 성공
    1 — 실패 건 있음
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date, datetime
from pathlib import Path

from loguru import logger


def _load_env() -> None:
    env_path = Path(__file__).parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="worker.agent.main",
        description="B.CAVE LLM 분석 에이전트",
    )
    p.add_argument(
        "--mode",
        choices=["analyze"],
        default="analyze",
        help="실행 모드 (현재: analyze)",
    )
    p.add_argument(
        "--date",
        default=None,
        metavar="YYYY-MM-DD",
        help="분석 기준 날짜 (기본: 오늘)",
    )
    p.add_argument(
        "--provider",
        choices=["ollama", "anthropic"],
        default="ollama",
        help="LLM 제공자 (기본: ollama)",
    )
    p.add_argument(
        "--model",
        default=None,
        metavar="MODEL",
        help="사용 모델 (기본: OLLAMA_MODEL 환경변수 또는 gemma4:e4b)",
    )
    p.add_argument("--dry-run", action="store_true", help="DB 쓰기 생략")
    return p.parse_args()


async def _run(args: argparse.Namespace, target_date: date) -> dict[str, int]:
    from worker.agent.analyst import run_analysis
    from worker.agent.llm_client import AnthropicClient, OllamaClient
    from worker.ingest.supabase_writer import get_client

    sb = get_client()

    if args.provider == "ollama":
        llm = OllamaClient()
    else:
        llm = AnthropicClient(model=args.model or "claude-haiku-4-5-20251001")

    if args.model:
        os.environ["OLLAMA_MODEL"] = args.model

    return await run_analysis(sb=sb, llm=llm, target_date=target_date, dry_run=args.dry_run)


def main() -> None:
    _load_env()
    args = _parse_args()

    target_date = (
        datetime.strptime(args.date, "%Y-%m-%d").date()
        if args.date
        else date.today()
    )

    logger.info(
        f"[agent] mode={args.mode} date={target_date} "
        f"provider={args.provider} dry_run={args.dry_run}"
    )

    stats = asyncio.run(_run(args, target_date))

    bar = "=" * 52
    print(f"\n{bar}")
    print(f"  LLM 분석  날짜={target_date}  provider={args.provider}")
    print(f"  대상:   {stats['total']:>6}건")
    print(f"  성공:   {stats['success']:>6}건")
    print(f"  실패:   {stats['failed']:>6}건")
    if args.dry_run:
        print("  [DRY-RUN] DB 쓰기 생략")
    print(f"{bar}\n")

    if stats["failed"] > 0:
        print(f"[WARN] {stats['failed']}건 분석 실패 (환각·파싱 오류 등 — 로그 확인)")
    if stats["total"] == 0:
        print(f"[INFO] {target_date} 분석 대상 없음 (anomalies 0건 또는 전일 분석 완료)")

    sys.exit(1 if stats["failed"] > 0 else 0)


if __name__ == "__main__":
    main()
