"""
Snowflake → own_skus 풀러 (Phase 2.1 단계 C-2).

커버낫(covernat)·리(lee)·와키윌리(wakywilly) 3개 브랜드 SKU를
BCAVE.SEWON.V_PRODUCT_DAILY_SNAPSHOT 뷰에서 읽어 own_skus 테이블에 적재.

사용법:
    python -m worker.matchers.snowflake_pull --brands covernat,lee,wakywilly
    python -m worker.matchers.snowflake_pull --brands covernat,lee,wakywilly --dry-run

컬럼명 확인: 이슬비·은상이와 확인 후 SNOWFLAKE_COLUMNS 상수를 업데이트.
현재 가정 컬럼: sku_code, product_name, category, msrp_price (brand_slug는 --brands 매핑).
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import snowflake.connector
from loguru import logger
from supabase import Client

# ─── 설정 상수 ──────────────────────────────────────────────────────────────

SNOWFLAKE_VIEW = "BCAVE.SEWON.V_PRODUCT_DAILY_SNAPSHOT"

# ⚠️ 실제 컬럼명은 이슬비·은상이와 확인 후 업데이트.
# 현재는 설계 문서 3.1절 기준 추정값.
SNOWFLAKE_COLUMNS = {
    "sku_code":     "SKU_CODE",       # 자사 SKU 코드
    "product_name": "PRODUCT_NAME",   # 상품명
    "category":     "CATEGORY",       # 카테고리
    "price":        "MSRP_PRICE",     # 정상가 (원)
    "brand_slug":   "BRAND_CODE",     # 브랜드 코드 → slug 매핑
}

# Snowflake brand_code → own_skus.brand_slug 매핑
# ⚠️ 실제 BRAND_CODE 값은 Snowflake 확인 후 업데이트.
BRAND_CODE_TO_SLUG: dict[str, str] = {
    "COVERNAT":   "covernat",
    "LEE":        "lee",
    "WAKYWILLY":  "wakywilly",
}

# slug → Snowflake brand_code 역매핑
SLUG_TO_BRAND_CODE: dict[str, str] = {v: k for k, v in BRAND_CODE_TO_SLUG.items()}

TARGET_BRANDS = ["covernat", "lee", "wakywilly"]


# ─── Snowflake 연결 ──────────────────────────────────────────────────────────


def _snowflake_conn() -> snowflake.connector.SnowflakeConnection:
    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
        role=os.environ.get("SNOWFLAKE_ROLE", "SVC_COMPETITOR_RADAR_READER"),
        database="BCAVE",
        schema="SEWON",
    )


# ─── 풀 함수 ────────────────────────────────────────────────────────────────


def pull_skus(brands: list[str]) -> list[dict]:
    """Snowflake에서 지정 브랜드 SKU 조회. brand_slug 포함한 dict 리스트 반환."""
    if not brands:
        return []

    brand_codes = [SLUG_TO_BRAND_CODE[s] for s in brands if s in SLUG_TO_BRAND_CODE]
    if not brand_codes:
        logger.warning("pull_skus: 알 수 없는 brand slug, Snowflake 조회 생략")
        return []

    c = SNOWFLAKE_COLUMNS
    placeholders = ", ".join(f"'{bc}'" for bc in brand_codes)

    sql = f"""
        SELECT
            {c['brand_slug']}  AS brand_code,
            {c['sku_code']}    AS sku_code,
            {c['product_name']} AS product_name,
            {c['category']}    AS category,
            {c['price']}       AS price
        FROM {SNOWFLAKE_VIEW}
        WHERE {c['brand_slug']} IN ({placeholders})
    """

    conn = _snowflake_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql)
        rows = cur.fetchall()
        cols = [d[0].lower() for d in cur.description]
        cur.close()
    finally:
        conn.close()

    results: list[dict] = []
    for row in rows:
        r = dict(zip(cols, row))
        brand_code = str(r.get("brand_code", "")).upper()
        slug = BRAND_CODE_TO_SLUG.get(brand_code)
        if not slug:
            continue
        results.append({
            "brand_slug":   slug,
            "sku_code":     str(r.get("sku_code", "") or "").strip(),
            "product_name": str(r.get("product_name", "") or "").strip() or None,
            "category":     str(r.get("category", "") or "").strip() or None,
            "price":        int(r["price"]) if r.get("price") is not None else None,
            "source":       "snowflake",
            "pulled_at":    datetime.now(tz=timezone.utc).isoformat(),
        })

    logger.bind(brands=brands, total=len(results)).info("snowflake_pull_done")
    return results


# ─── Supabase 적재 ───────────────────────────────────────────────────────────


def upsert_skus(sb: Client, rows: list[dict], dry_run: bool) -> int:
    """own_skus 테이블에 upsert. ON CONFLICT (brand_slug, sku_code) DO UPDATE."""
    if not rows or dry_run:
        return 0

    # embedding 은 별도 embedder.py 에서 채움 — 여기서는 null
    resp = (
        sb.table("own_skus")
        .upsert(
            rows,
            on_conflict="brand_slug,sku_code",
            ignore_duplicates=False,
        )
        .execute()
    )
    inserted = len(resp.data) if resp.data else 0
    logger.bind(upserted=inserted).info("own_skus_upsert_done")
    return inserted


# ─── 환경 로드 ───────────────────────────────────────────────────────────────


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


# ─── CLI ─────────────────────────────────────────────────────────────────────


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="worker.matchers.snowflake_pull",
        description="Snowflake → own_skus 풀러",
    )
    p.add_argument(
        "--brands",
        default=",".join(TARGET_BRANDS),
        metavar="slug1,slug2,...",
        help=f"대상 브랜드 slug (기본: {','.join(TARGET_BRANDS)})",
    )
    p.add_argument("--dry-run", action="store_true", help="DB INSERT 생략")
    return p.parse_args()


def main() -> None:
    _load_env()
    args = _parse_args()

    brands = [b.strip() for b in args.brands.split(",") if b.strip()]
    unknown = [b for b in brands if b not in TARGET_BRANDS]
    if unknown:
        print(f"ERROR: 허용되지 않은 brand slug: {unknown}")
        print(f"       허용 목록: {TARGET_BRANDS}")
        sys.exit(1)

    logger.info(f"[snowflake_pull] 브랜드={brands} dry_run={args.dry_run}")

    rows = pull_skus(brands)
    if not rows:
        print("[WARN] Snowflake에서 0건 조회됨. 컬럼명 또는 브랜드 코드 확인 필요.")
        sys.exit(0)

    print(f"[INFO] Snowflake 조회: {len(rows)}건")
    if args.dry_run:
        for r in rows[:5]:
            print(f"  {r['brand_slug']} | {r['sku_code']} | {r['product_name']} | {r['price']}")
        if len(rows) > 5:
            print(f"  ... 외 {len(rows) - 5}건")
        print("[DRY-RUN] DB INSERT 생략.")
        return

    from worker.ingest.supabase_writer import get_client
    sb = get_client()
    upserted = upsert_skus(sb, rows, dry_run=False)
    print(f"[INFO] own_skus upsert: {upserted}건")


if __name__ == "__main__":
    main()
