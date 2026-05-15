"""
상품 상세 데이터 적재 레이어.

MusinsaProductScraper 가 반환한 ProductDetail dict 목록을 받아
4 테이블(+ products 갱신)에 멱등 적재한다.

적재 대상:
  1. products             — tags, description, main_image_url, detail_last_scraped_at UPDATE
  2. product_snapshots    — wishlist_count, brand_like_count UPDATE (오늘 행)
  3. product_recommendations — similar/also_viewed INSERT ON CONFLICT DO NOTHING
  4. product_snaps        — 스냅 메타데이터 INSERT ON CONFLICT DO NOTHING
  5. product_review_summaries — ai_summary·keyword_scores·rating_dist UPSERT

멱등성:
  - products·product_snapshots: UPDATE 덮어쓰기 (동일 값이면 no-op과 동일 효과)
  - recommendations·snaps: ON CONFLICT DO NOTHING (재실행 시 중복 없음)
  - review_summaries: ON CONFLICT DO UPDATE (당일 재실행 시 최신값 갱신)

공통 유틸리티(get_client, _KST)는 supabase_writer 에서 re-import.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from typing import Any

from loguru import logger
from supabase import Client

from .supabase_writer import _KST, get_client  # noqa: F401 (re-export for callers)

_BULK_SIZE = 200


# ---------------------------------------------------------------------------
# 결과 dataclass
# ---------------------------------------------------------------------------


@dataclass
class DetailIngestResult:
    products_updated: int = 0
    snapshots_updated: int = 0
    recommendations_inserted: int = 0
    snaps_inserted: int = 0
    review_summaries_upserted: int = 0
    skipped: int = 0
    failed: int = 0

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


# ---------------------------------------------------------------------------
# 우선순위 상품 선정
# ---------------------------------------------------------------------------


def select_priority_products(
    client: Client,
    top: int,
    snapshot_date: date | None = None,
) -> list[dict[str, Any]]:
    """오늘 랭킹 기준 카테고리당 균등 분배로 상위 top 개 상품 선정.

    depth=1·is_active=true 카테고리에 한해 카테고리당 ceil(top/N_cat) 개씩 취합.
    랭킹 데이터가 없으면 [] 반환 (--mode ranking 을 먼저 실행해야 함).
    """
    today = snapshot_date or datetime.now(_KST).date()

    # 오늘 스냅샷 + products + categories 한 번에 조회
    res = (
        client.table("product_snapshots")
        .select(
            "product_id, rank_main, "
            "products!inner(id, musinsa_no, "
            "categories!inner(musinsa_code, depth, is_active))"
        )
        .eq("snapshot_date", today.isoformat())
        .order("rank_main")
        .execute()
    )

    # Python side: depth=1·is_active 필터 → 카테고리별 그룹
    by_cat: dict[str, list[dict[str, Any]]] = {}
    for row in res.data or []:
        product = row.get("products") or {}
        category = product.get("categories") or {}
        if category.get("depth") != 1 or not category.get("is_active"):
            continue
        cat_code = category.get("musinsa_code", "")
        if not cat_code:
            continue
        by_cat.setdefault(cat_code, []).append(
            {
                "id": product.get("id"),
                "musinsa_no": product.get("musinsa_no"),
                "musinsa_code": cat_code,
                "rank_main": row.get("rank_main") or 99_999,
            }
        )

    if not by_cat:
        logger.bind(snapshot_date=today.isoformat()).warning("no_today_ranking_data")
        return []

    num_cats = len(by_cat)
    per_cat = max(1, math.ceil(top / num_cats))

    result: list[dict[str, Any]] = []
    for cat_code in sorted(by_cat.keys()):
        items = sorted(by_cat[cat_code], key=lambda x: x["rank_main"])
        result.extend(items[:per_cat])

    # 전체 top 초과분 제거
    result = result[:top]

    logger.bind(
        top=top,
        num_cats=num_cats,
        per_cat=per_cat,
        selected=len(result),
        snapshot_date=today.isoformat(),
    ).info("priority_products_selected")

    return result


# ---------------------------------------------------------------------------
# 내부 배치 헬퍼
# ---------------------------------------------------------------------------


def _bulk_upsert(
    client: Client,
    table: str,
    rows: list[dict[str, Any]],
    on_conflict: str,
    *,
    ignore_duplicates: bool = False,
) -> int:
    """rows 를 _BULK_SIZE 단위로 나눠 upsert. 성공 건수 반환."""
    total = 0
    for i in range(0, len(rows), _BULK_SIZE):
        batch = rows[i : i + _BULK_SIZE]
        try:
            res = (
                client.table(table)
                .upsert(
                    batch,
                    on_conflict=on_conflict,
                    ignore_duplicates=ignore_duplicates,
                )
                .execute()
            )
            total += len(res.data or [])
        except Exception as exc:
            logger.bind(
                table=table,
                batch_start=i,
                batch_size=len(batch),
                error=str(exc),
            ).error("bulk_upsert_failed")
    return total


# ---------------------------------------------------------------------------
# 공개 인터페이스
# ---------------------------------------------------------------------------


def ingest_product_details(
    client: Client,
    details: list[dict[str, Any]],
    snapshot_date: date | None = None,
) -> DetailIngestResult:
    """ProductDetail dict 목록을 5 테이블에 멱등 적재.

    Args:
        client:        get_client() 로 생성한 Supabase 클라이언트 (service_role)
        details:       ProductDetail.model_dump() 목록
        snapshot_date: 스냅샷 날짜 (기본: 오늘 KST)

    Returns:
        DetailIngestResult — 테이블별 적재 건수·skip·failed
    """
    if not details:
        return DetailIngestResult()

    result = DetailIngestResult()
    today = snapshot_date or datetime.now(_KST).date()
    now_utc = datetime.now(UTC).isoformat()
    today_str = today.isoformat()

    logger.bind(total=len(details), snapshot_date=today_str).info("detail_ingest_start")

    # ------------------------------------------------------------------
    # 0. musinsa_no → product_id 매핑 (1 batch)
    # ------------------------------------------------------------------
    all_nos = [d["musinsa_no"] for d in details]
    pid_res = (
        client.table("products")
        .select("id, musinsa_no")
        .in_("musinsa_no", all_nos)
        .execute()
    )
    mno_to_pid: dict[str, str] = {
        row["musinsa_no"]: row["id"] for row in (pid_res.data or [])
    }

    # ------------------------------------------------------------------
    # 1. 추천 상품 musinsa_no → product_id (FK용, 1 batch)
    # ------------------------------------------------------------------
    all_rec_nos: set[str] = set()
    for d in details:
        for rec in d.get("similar_products") or []:
            all_rec_nos.add(rec["musinsa_no"])
        for rec in d.get("also_viewed_products") or []:
            all_rec_nos.add(rec["musinsa_no"])

    rec_mno_to_pid: dict[str, str] = {}
    if all_rec_nos:
        rec_res = (
            client.table("products")
            .select("id, musinsa_no")
            .in_("musinsa_no", list(all_rec_nos))
            .execute()
        )
        rec_mno_to_pid = {
            row["musinsa_no"]: row["id"] for row in (rec_res.data or [])
        }

    # ------------------------------------------------------------------
    # 2. 오늘 product_snapshots id 매핑 (1 batch)
    # ------------------------------------------------------------------
    all_pids = list(mno_to_pid.values())
    snap_res = (
        client.table("product_snapshots")
        .select("id, product_id")
        .in_("product_id", all_pids)
        .eq("snapshot_date", today_str)
        .execute()
    )
    pid_to_snap_id: dict[str, str] = {
        row["product_id"]: row["id"] for row in (snap_res.data or [])
    }

    # ------------------------------------------------------------------
    # 3. 상품별 순회 — 개별 UPDATE + 배치 INSERT 행 수집
    # ------------------------------------------------------------------
    rec_rows: list[dict[str, Any]] = []
    snap_rows: list[dict[str, Any]] = []
    review_rows: list[dict[str, Any]] = []

    for d in details:
        mno = d["musinsa_no"]
        pid = mno_to_pid.get(mno)

        if not pid:
            logger.bind(musinsa_no=mno).warning("product_not_in_db_skip")
            result.skipped += 1
            continue

        # ── 3a. products UPDATE ─────────────────────────────────────────
        try:
            prod_payload: dict[str, Any] = {"detail_last_scraped_at": now_utc}
            if d.get("tags") is not None:
                prod_payload["tags"] = d["tags"]
            if d.get("description") is not None:
                prod_payload["description"] = d["description"]
            if d.get("main_image_url") is not None:
                prod_payload["main_image_url"] = d["main_image_url"]

            client.table("products").update(prod_payload).eq("id", pid).execute()
            result.products_updated += 1
        except Exception as exc:
            logger.bind(musinsa_no=mno, error=str(exc)).error("products_update_failed")
            result.failed += 1
            continue

        # ── 3b. product_snapshots UPDATE ────────────────────────────────
        snap_id = pid_to_snap_id.get(pid)
        if snap_id:
            snap_upd: dict[str, Any] = {}
            if d.get("wishlist_count") is not None:
                snap_upd["wishlist_count"] = d["wishlist_count"]
            if d.get("brand_like_count") is not None:
                snap_upd["brand_like_count"] = d["brand_like_count"]
            if snap_upd:
                try:
                    client.table("product_snapshots").update(snap_upd).eq("id", snap_id).execute()
                    result.snapshots_updated += 1
                except Exception as exc:
                    logger.bind(musinsa_no=mno, error=str(exc)).error("snapshot_update_failed")
                    result.failed += 1
        else:
            logger.bind(
                musinsa_no=mno,
                snapshot_date=today_str,
            ).warning("today_snapshot_not_found")

        # ── 3c. product_recommendations 행 수집 ─────────────────────────
        for rec in (d.get("similar_products") or []):
            rec_rows.append(
                {
                    "product_id": pid,
                    "snapshot_date": today_str,
                    "kind": rec["kind"],
                    "recommended_musinsa_no": rec["musinsa_no"],
                    "rank": rec["rank"],
                    "recommended_product_id": rec_mno_to_pid.get(rec["musinsa_no"]),
                    "scraped_at": now_utc,
                }
            )
        for rec in (d.get("also_viewed_products") or []):
            rec_rows.append(
                {
                    "product_id": pid,
                    "snapshot_date": today_str,
                    "kind": rec["kind"],
                    "recommended_musinsa_no": rec["musinsa_no"],
                    "rank": rec["rank"],
                    "recommended_product_id": rec_mno_to_pid.get(rec["musinsa_no"]),
                    "scraped_at": now_utc,
                }
            )

        # ── 3d. product_snaps 행 수집 ───────────────────────────────────
        for sn in (d.get("snaps") or []):
            posted_at = sn.get("posted_at")
            snap_rows.append(
                {
                    "product_id": pid,
                    "snapshot_date": today_str,
                    "musinsa_snap_id": sn["snap_id"],
                    "image_url": sn["image_url"],
                    "caption": sn.get("caption"),
                    "posted_at": posted_at.isoformat() if hasattr(posted_at, "isoformat") else posted_at,
                    "scraped_at": now_utc,
                }
            )

        # ── 3e. product_review_summaries 행 수집 ────────────────────────
        has_review_data = any(
            d.get(f) is not None
            for f in ("ai_summary", "keyword_scores", "total_reviews", "rating_distribution")
        )
        if has_review_data:
            review_rows.append(
                {
                    "product_id": pid,
                    "snapshot_date": today_str,
                    "ai_summary": d.get("ai_summary"),
                    "keyword_scores": d.get("keyword_scores"),
                    "rating_distribution": d.get("rating_distribution"),
                    "total_reviews": d.get("total_reviews"),
                    "scraped_at": now_utc,
                }
            )

    # ------------------------------------------------------------------
    # 4. 배치 INSERT (추천·스냅·리뷰요약)
    # ------------------------------------------------------------------
    if rec_rows:
        result.recommendations_inserted = _bulk_upsert(
            client,
            "product_recommendations",
            rec_rows,
            on_conflict="product_id,snapshot_date,kind,recommended_musinsa_no",
            ignore_duplicates=True,
        )

    if snap_rows:
        result.snaps_inserted = _bulk_upsert(
            client,
            "product_snaps",
            snap_rows,
            on_conflict="product_id,snapshot_date,musinsa_snap_id",
            ignore_duplicates=True,
        )

    if review_rows:
        result.review_summaries_upserted = _bulk_upsert(
            client,
            "product_review_summaries",
            review_rows,
            on_conflict="product_id,snapshot_date",
            ignore_duplicates=False,  # DO UPDATE — 당일 재실행 시 최신값 덮어쓰기
        )

    logger.bind(**result.to_dict(), snapshot_date=today_str).info("detail_ingest_complete")
    return result
