"""
worker/enrichment/apply_company_brands.py — Phase 1.5.2 Stage D.

검증된 CSV 를 받아 brands 테이블 INSERT + company_id 매핑.

모드:
    verified     /tmp/company_brand_verified_final.csv → musinsa slug 기준 매핑
    not_listed   /tmp/company_brand_high_listed.csv    → musinsa 미입점 brand 신규 INSERT

규칙:
    - is_own=true brand 는 company_id 포함 일체 수정 금지
    - 기존 brand 의 slug·musinsa_brand_id 수정 금지
    - INSERT / company_id UPDATE 만 허용

실행:
    worker/.venv/bin/python3 -m worker.enrichment.apply_company_brands \\
        --csv /tmp/company_brand_verified_final.csv --mode verified

    worker/.venv/bin/python3 -m worker.enrichment.apply_company_brands \\
        --csv /tmp/company_brand_high_listed.csv --mode not_listed
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

from loguru import logger
from worker.enrichment.brand_metadata import _load_env
from worker.ingest.supabase_writer import get_client as get_supabase

_load_env()

_VERIFIED_CSV = Path('/tmp/company_brand_verified_final.csv')
_NOT_LISTED_CSV = Path('/tmp/company_brand_high_listed.csv')


# ---------------------------------------------------------------------------
# Slug helpers
# ---------------------------------------------------------------------------

def _slugify(text: str) -> str:
    """영문 텍스트 → URL-safe 소문자 slug."""
    s = text.lower()
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s or "brand"


def _unique_slug(base: str, existing: set[str]) -> str:
    """base slug 로 시작해 중복 없는 슬러그 반환."""
    if base not in existing:
        return base
    i = 2
    while f"{base}{i}" in existing:
        i += 1
    return f"{base}{i}"


# ---------------------------------------------------------------------------
# verified 모드
# ---------------------------------------------------------------------------

def _run_verified(csv_path: Path, supabase) -> None:
    """musinsa slug 기준으로 brands 행 탐색 → INSERT 또는 company_id UPDATE."""
    if not csv_path.exists():
        print(f"[ERROR] CSV 없음: {csv_path}")
        sys.exit(1)

    with csv_path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    now = datetime.now(UTC).isoformat()
    inserted = 0
    updated = 0
    skipped = 0
    warnings: list[str] = []

    print(f"\n[verified] 처리 대상: {len(rows)}건")
    print("=" * 60)

    for row in rows:
        musinsa_slug = row["musinsa_slug"].strip()
        company_id = row["company_id"].strip()
        name_ko = row["candidate_name_ko"].strip()
        match_method = row["match_method"].strip()
        # company_mapping_confidence 제약: high|medium|low|unknown
        confidence_val = "high" if match_method.startswith("exact") else "medium"

        # ── 기존 brand 조회 (slug 기준) ────────────────────────────
        resp = (
            supabase.table("brands")
            .select("id, slug, name, company_id, is_own, musinsa_brand_id")
            .eq("slug", musinsa_slug)
            .limit(1)
            .execute()
        )
        existing = resp.data[0] if resp.data else None

        if existing:
            if existing.get("is_own"):
                logger.debug(f"SKIP is_own: slug={musinsa_slug}")
                skipped += 1
                continue

            if existing.get("company_id") and existing["company_id"] == company_id:
                logger.debug(f"SKIP already_mapped: slug={musinsa_slug}")
                skipped += 1
                continue

            if existing.get("company_id") and existing["company_id"] != company_id:
                warnings.append(
                    f"CONFLICT: slug={musinsa_slug} 이미 다른 company_id={existing['company_id']!r}"
                )
                skipped += 1
                continue

            # company_id UPDATE
            supabase.table("brands").update(
                {
                    "company_id": company_id,
                    "company_mapping_confidence": confidence_val,
                }
            ).eq("id", existing["id"]).execute()
            logger.bind(slug=musinsa_slug).debug("brand_company_id_updated")
            updated += 1

        else:
            # INSERT new brand
            new_id = str(uuid.uuid4())
            supabase.table("brands").insert(
                {
                    "id": new_id,
                    "slug": musinsa_slug,
                    "name": name_ko,
                    "musinsa_brand_id": musinsa_slug,
                    "company_id": company_id,
                    "is_competitor": True,
                    "is_own": False,
                    "company_mapping_confidence": confidence_val,
                    "created_at": now,
                }
            ).execute()
            logger.bind(slug=musinsa_slug).debug("brand_inserted")
            inserted += 1

    print(f"완료  INSERT={inserted}  UPDATE={updated}  SKIP={skipped}")
    if warnings:
        print(f"\n⚠ 충돌 {len(warnings)}건 (SKIP):")
        for w in warnings:
            print(f"  {w}")


# ---------------------------------------------------------------------------
# not_listed 모드
# ---------------------------------------------------------------------------

def _run_not_listed(csv_path: Path, supabase) -> None:
    """무신사 미입점 brand 신규 INSERT (musinsa_brand_id=null)."""
    if not csv_path.exists():
        print(f"[ERROR] CSV 없음: {csv_path}")
        sys.exit(1)

    with csv_path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # 기존 slug 풀 로드 (중복 방지)
    slug_resp = supabase.table("brands").select("slug").execute()
    existing_slugs: set[str] = {r["slug"] for r in (slug_resp.data or [])}

    now = datetime.now(UTC).isoformat()
    inserted = 0
    skipped = 0

    print(f"\n[not_listed] 처리 대상: {len(rows)}건")
    print("=" * 60)

    for row in rows:
        company_id = row["company_id"].strip()
        company_name = row["company_name"].strip()
        name_ko = row["candidate_name_ko"].strip()
        name_en = row["candidate_name_en"].strip()

        # ── 이름 기준 기존 brand 검색 ──────────────────────────────
        name_resp = (
            supabase.table("brands")
            .select("id, company_id, is_own")
            .eq("name", name_ko)
            .limit(1)
            .execute()
        )
        by_name = name_resp.data[0] if name_resp.data else None

        if by_name:
            if by_name.get("is_own"):
                logger.debug(f"SKIP is_own: name={name_ko}")
                skipped += 1
                continue
            if by_name.get("company_id") and by_name["company_id"] == company_id:
                logger.debug(f"SKIP already_mapped: name={name_ko}")
                skipped += 1
                continue
            # 이미 다른 company_id 매핑 → SKIP
            if by_name.get("company_id"):
                logger.debug(f"SKIP conflict: name={name_ko}")
                skipped += 1
                continue
            # company_id null → UPDATE
            supabase.table("brands").update(
                {
                    "company_id": company_id,
                    "company_mapping_confidence": "medium",
                }
            ).eq("id", by_name["id"]).execute()
            skipped += 1  # name 기준 UPDATE → skipped 로 계산
            continue

        # ── slug 생성 ───────────────────────────────────────────────
        base_slug = _slugify(name_en) if name_en else _slugify(name_ko)
        if not base_slug or base_slug == "brand":
            base_slug = f"co_{_slugify(company_name)}_{_slugify(name_ko)}"
        slug = _unique_slug(base_slug, existing_slugs)
        existing_slugs.add(slug)

        new_id = str(uuid.uuid4())
        supabase.table("brands").insert(
            {
                "id": new_id,
                "slug": slug,
                "name": name_ko,
                "musinsa_brand_id": None,
                "company_id": company_id,
                "is_competitor": True,
                "is_own": False,
                "company_mapping_confidence": "low",
                "created_at": now,
            }
        ).execute()
        logger.bind(slug=slug, name=name_ko).debug("brand_not_listed_inserted")
        inserted += 1

    print(f"완료  INSERT={inserted}  SKIP(중복/충돌)={skipped}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Company brand 적재 CLI")
    parser.add_argument("--csv", required=True, help="입력 CSV 경로")
    parser.add_argument(
        "--mode", required=True, choices=["verified", "not_listed"]
    )
    args = parser.parse_args()

    supabase = get_supabase()

    if args.mode == "verified":
        _run_verified(Path(args.csv), supabase)
    elif args.mode == "not_listed":
        _run_not_listed(Path(args.csv), supabase)


if __name__ == "__main__":
    main()
