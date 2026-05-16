"""
Supabase 적재 레이어.

스크래퍼가 반환한 RankingItem dict 목록을 받아
brands → products → product_snapshots 순으로 upsert 한다.

멱등성 보장:
  - brands:           slug UNIQUE, ignore_duplicates=True (seed 데이터 보호)
  - products:         musinsa_no UNIQUE, merge-duplicates (name/list_price/last_updated_at 갱신)
  - product_snapshots:(product_id, snapshot_date) UNIQUE, merge-duplicates (당일 재실행 덮어쓰기)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

from loguru import logger
from supabase import Client, create_client

_KST = timezone(timedelta(hours=9))
_PRODUCT_URL = "https://www.musinsa.com/products/{}"
_SNAPSHOT_BULK_SIZE = 200


# ---------------------------------------------------------------------------
# Client factory
# ---------------------------------------------------------------------------


def get_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],  # service_role — RLS bypass, 절대 로그 출력 금지
    )


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class IngestResult:
    total: int = 0
    brands_created: int = 0
    products_created: int = 0
    snapshots_written: int = 0
    failed: int = 0


# ---------------------------------------------------------------------------
# Internal batch helpers
# ---------------------------------------------------------------------------


def _load_category_cache(client: Client) -> dict[str, str]:
    """categories 테이블 전체 로드 → {musinsa_code: category_id}."""
    res = client.table("categories").select("id, musinsa_code").execute()
    return {row["musinsa_code"]: row["id"] for row in (res.data or [])}


def _upsert_brands_batch(
    client: Client,
    payloads: list[dict[str, Any]],
) -> tuple[dict[str, str], int]:
    """브랜드 배치 upsert.

    ignore_duplicates=True → ON CONFLICT DO NOTHING → seed의 is_own/tier 등 보존.
    반환: ({slug: id}, created_count)
    """
    if not payloads:
        return {}, 0

    res = (
        client.table("brands")
        .upsert(payloads, on_conflict="slug", ignore_duplicates=True)
        .execute()
    )
    created = len(res.data or [])

    slugs = [p["slug"] for p in payloads]
    fetch = client.table("brands").select("id, slug").in_("slug", slugs).execute()
    id_map: dict[str, str] = {row["slug"]: row["id"] for row in (fetch.data or [])}
    return id_map, created


def _upsert_products_batch(
    client: Client,
    payloads: list[dict[str, Any]],
) -> tuple[dict[str, str], int]:
    """상품 배치 upsert.

    ON CONFLICT DO UPDATE → name/list_price/last_updated_at 갱신.
    first_seen_at 은 payload에 포함하지 않아 최초 값 보존.
    반환: ({musinsa_no: id}, created_count)
    """
    if not payloads:
        return {}, 0

    musinsa_nos = [p["musinsa_no"] for p in payloads]
    existing_res = (
        client.table("products")
        .select("musinsa_no")
        .in_("musinsa_no", musinsa_nos)
        .execute()
    )
    existing_nos = {row["musinsa_no"] for row in (existing_res.data or [])}

    res = client.table("products").upsert(payloads, on_conflict="musinsa_no").execute()
    id_map: dict[str, str] = {row["musinsa_no"]: row["id"] for row in (res.data or [])}
    created = len(set(id_map.keys()) - existing_nos)
    return id_map, created


def _upsert_snapshots_bulk(client: Client, snapshots: list[dict[str, Any]]) -> int:
    """스냅샷 배치 upsert — 200건씩 분할.

    ON CONFLICT DO UPDATE → 당일 재실행 시 최신 값으로 덮어쓰기.
    배치 실패는 로그 후 계속 진행 (다른 배치에 영향 없음).
    반환: 성공 건수
    """
    total = 0
    for i in range(0, len(snapshots), _SNAPSHOT_BULK_SIZE):
        batch = snapshots[i : i + _SNAPSHOT_BULK_SIZE]
        try:
            res = (
                client.table("product_snapshots")
                .upsert(batch, on_conflict="product_id,snapshot_date")
                .execute()
            )
            total += len(res.data or [])
        except Exception as exc:
            logger.bind(
                batch_start=i,
                batch_size=len(batch),
                error=str(exc),
            ).error("snapshot_batch_failed")
    return total


# ---------------------------------------------------------------------------
# Public single-item helpers (02-ingestion.md §3.2 interface)
# ---------------------------------------------------------------------------


def upsert_brand(client: Client, slug: str, name: str) -> str:
    """slug 기준 upsert, brand_id 반환."""
    id_map, _ = _upsert_brands_batch(client, [{"slug": slug, "name": name}])
    return id_map[slug]


def upsert_product(
    client: Client,
    musinsa_no: str,
    brand_id: str,
    *,
    name: str,
    list_price: int | None = None,
    category_id: str | None = None,
) -> str:
    """musinsa_no 기준 upsert, product_id 반환."""
    payload: dict[str, Any] = {
        "musinsa_no": musinsa_no,
        "brand_id": brand_id,
        "name": name,
        "url": _PRODUCT_URL.format(musinsa_no),
        "last_updated_at": datetime.now(UTC).isoformat(),
    }
    if list_price is not None:
        payload["list_price"] = list_price
    if category_id is not None:
        payload["category_id"] = category_id

    id_map, _ = _upsert_products_batch(client, [payload])
    return id_map[musinsa_no]


def insert_snapshot(client: Client, snapshot: dict[str, Any]) -> None:
    """(product_id, snapshot_date) 기준 upsert — 충돌 시 DO NOTHING."""
    client.table("product_snapshots").upsert(
        snapshot,
        on_conflict="product_id,snapshot_date",
        ignore_duplicates=True,
    ).execute()


def upsert_snapshots_bulk(
    client: Client,
    snapshots: list[dict[str, Any]],
    batch_size: int = 200,
) -> int:
    """스냅샷 배치 upsert — batch_size 건씩 분할.

    ON CONFLICT DO UPDATE → 당일 재실행 시 최신 값으로 덮어쓰기.
    _upsert_snapshots_bulk(private)과 동일 동작, configurable batch_size 제공.
    반환: 성공 건수.
    """
    total = 0
    for i in range(0, len(snapshots), batch_size):
        batch = snapshots[i : i + batch_size]
        try:
            res = (
                client.table("product_snapshots")
                .upsert(batch, on_conflict="product_id,snapshot_date")
                .execute()
            )
            total += len(res.data or [])
        except Exception as exc:
            logger.bind(
                batch_start=i,
                batch_size=len(batch),
                error=str(exc),
            ).error("snapshot_bulk_batch_failed")
    return total


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


def ingest_ranking_items(
    client: Client,
    items: list[dict[str, Any]],
    snapshot_date: date | None = None,
) -> IngestResult:
    """랭킹 스크래퍼 결과를 brands → products → product_snapshots 순서로 적재.

    Args:
        client:        get_client() 로 생성한 Supabase 클라이언트
        items:         MusinsaRankingScraper.scrape() 의 반환값 (list[dict])
        snapshot_date: 스냅샷 날짜 (기본: 오늘 KST 기준)

    Returns:
        IngestResult — 브랜드/상품/스냅샷 적재 건수와 실패 건수
    """
    if not items:
        return IngestResult()

    result = IngestResult(total=len(items))
    today = snapshot_date or datetime.now(_KST).date()
    now_utc = datetime.now(UTC)

    logger.bind(
        total=result.total,
        snapshot_date=today.isoformat(),
    ).info("ingest_start")

    # ------------------------------------------------------------------
    # 1. 카테고리 캐시 로드 (1 query)
    # ------------------------------------------------------------------
    cat_cache = _load_category_cache(client)
    logger.bind(category_count=len(cat_cache)).debug("category_cache_loaded")

    # ------------------------------------------------------------------
    # 2. 브랜드 upsert (ignore_duplicates → seed 보호)
    # ------------------------------------------------------------------
    brand_slugs: dict[str, str] = {}
    for item in items:
        slug = item.get("brand_slug", "")
        if slug:
            brand_slugs.setdefault(slug, item.get("brand_name", ""))

    brand_payloads = [{"slug": s, "name": n, "musinsa_brand_id": s} for s, n in brand_slugs.items()]
    brand_id_map, brands_created = _upsert_brands_batch(client, brand_payloads)
    result.brands_created = brands_created
    logger.bind(
        upserted=len(brand_id_map),
        created=brands_created,
    ).info("brands_upserted")

    # 기존 musinsa_brand_id=NULL 행 백필 (ignore_duplicates=True 이므로 신규만 적용됨)
    null_res = (
        client.table("brands")
        .select("id, slug")
        .in_("slug", list(brand_slugs.keys()))
        .is_("musinsa_brand_id", "null")
        .execute()
    )
    if null_res.data:
        for row in null_res.data:
            client.table("brands").update({"musinsa_brand_id": row["slug"]}).eq("id", row["id"]).execute()
        logger.bind(backfilled=len(null_res.data)).info("brands_musinsa_id_backfilled")

    # ------------------------------------------------------------------
    # 3. 상품 upsert (name/list_price/last_updated_at 갱신, first_seen_at 보존)
    # ------------------------------------------------------------------
    product_payloads: list[dict[str, Any]] = []
    musinsa_to_item: dict[str, dict[str, Any]] = {}

    for item in items:
        musinsa_no: str = item.get("musinsa_no", "")
        brand_id = brand_id_map.get(item.get("brand_slug", ""))

        if not brand_id:
            logger.bind(
                brand_slug=item.get("brand_slug"),
                musinsa_no=musinsa_no,
            ).warning("brand_id_missing")
            result.failed += 1
            continue

        category_id = cat_cache.get(item.get("category_code", ""))
        if not category_id and item.get("category_code"):
            logger.bind(
                category_code=item.get("category_code"),
                musinsa_no=musinsa_no,
            ).warning("category_not_found")

        payload: dict[str, Any] = {
            "musinsa_no": musinsa_no,
            "brand_id": brand_id,
            "name": item.get("product_name", ""),
            "url": _PRODUCT_URL.format(musinsa_no),
            "last_updated_at": now_utc.isoformat(),
        }
        if item.get("list_price") is not None:
            payload["list_price"] = item["list_price"]
        if category_id:
            payload["category_id"] = category_id
        if item.get("thumbnail_url"):
            payload["thumbnail_url"] = item["thumbnail_url"]

        product_payloads.append(payload)
        musinsa_to_item[musinsa_no] = item

    product_id_map, products_created = _upsert_products_batch(client, product_payloads)
    result.products_created = products_created
    logger.bind(
        upserted=len(product_id_map),
        created=products_created,
    ).info("products_upserted")

    # ------------------------------------------------------------------
    # 4. 스냅샷 upsert (200건 배치, 당일 재실행 덮어쓰기)
    # ------------------------------------------------------------------
    snapshots: list[dict[str, Any]] = []

    for musinsa_no, item in musinsa_to_item.items():
        product_id = product_id_map.get(musinsa_no)
        if not product_id:
            logger.bind(musinsa_no=musinsa_no).warning("product_id_missing")
            result.failed += 1
            continue

        scraped_at = item.get("scraped_at")
        scraped_at_str: str
        if isinstance(scraped_at, datetime):
            scraped_at_str = scraped_at.isoformat()
        elif scraped_at is not None:
            scraped_at_str = str(scraped_at)
        else:
            scraped_at_str = now_utc.isoformat()

        snapshots.append({
            "product_id": product_id,
            "snapshot_date": today.isoformat(),
            "rank_main": item.get("rank_main"),
            "current_price": item.get("current_price"),
            "discount_rate": item.get("discount_rate"),
            "review_count": item.get("review_count"),
            "rating": item.get("review_score"),   # 100점 만점 원본 저장 (00005 §1)
            "is_sold_out": item.get("is_sold_out", False),  # 00005 §2
            "list_price": item.get("list_price"),           # 00005 §2
            "scraped_at": scraped_at_str,
        })

    result.snapshots_written = _upsert_snapshots_bulk(client, snapshots)

    logger.bind(
        total=result.total,
        brands_created=result.brands_created,
        products_created=result.products_created,
        snapshots_written=result.snapshots_written,
        failed=result.failed,
    ).info("ingest_complete")

    return result
