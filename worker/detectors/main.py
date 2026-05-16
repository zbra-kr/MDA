"""
B.CAVE Competitor Radar — 이상탐지 CLI.

사용법:
    python -m worker.detectors.main --date 2026-05-17 --dry-run
    python -m worker.detectors.main --date 2026-05-17
    python -m worker.detectors.main --date 2026-05-17 --mode rank_surge,price_change

exit code:
    0 — 전체 성공 (탐지 결과 없어도 0)
    1 — 탐지기 1개 이상 실패
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from loguru import logger

from worker.detectors.base import AnomalyRecord
from worker.detectors.new_entrant import NewEntrantDetector
from worker.detectors.price_change import PriceChangeDetector
from worker.detectors.promo_start import PromoStartDetector
from worker.detectors.rank_surge import RankSurgeDetector
from worker.detectors.review_velocity import ReviewVelocityDetector
from worker.detectors.wishlist_surge import WishlistSurgeDetector

_ALL_MODES = [
    "rank_surge",
    "price_change",
    "review_velocity",
    "new_entrant",
    "promo_start",
    "wishlist_surge",
]

_DETECTOR_MAP = {
    "rank_surge":      RankSurgeDetector,
    "price_change":    PriceChangeDetector,
    "review_velocity": ReviewVelocityDetector,
    "new_entrant":     NewEntrantDetector,
    "promo_start":     PromoStartDetector,
    "wishlist_surge":  WishlistSurgeDetector,
}


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
        prog="worker.detectors.main",
        description="B.CAVE 이상탐지 실행",
    )
    p.add_argument(
        "--date",
        default=None,
        metavar="YYYY-MM-DD",
        help="탐지 기준 날짜 (기본: 오늘)",
    )
    p.add_argument(
        "--mode",
        default="all",
        metavar="all|rank_surge,...",
        help="실행할 탐지기 (콤마 구분, 기본: all)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="탐지만 실행, DB에 INSERT하지 않음",
    )
    return p.parse_args()


def insert_anomalies_bulk(sb, records: list[AnomalyRecord], dry_run: bool) -> int:
    """anomalies 테이블에 일괄 INSERT. ON CONFLICT DO NOTHING (멱등). 삽입 건수 반환."""
    if not records:
        return 0
    if dry_run:
        return 0

    rows = [
        {
            "product_id":   r.product_id,
            "snapshot_id":  r.snapshot_id,
            "detected_on":  r.detected_on.isoformat(),
            "anomaly_type": r.anomaly_type,
            "severity":     float(r.severity),
            "evidence":     r.evidence,
        }
        for r in records
    ]
    resp = (
        sb.table("anomalies")
        .upsert(rows, on_conflict="product_id,detected_on,anomaly_type", ignore_duplicates=True)
        .execute()
    )
    return len(resp.data) if resp.data else 0


def main() -> None:
    _load_env()
    args = _parse_args()

    detect_date: date
    if args.date:
        detect_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        detect_date = date.today()

    modes: list[str]
    if args.mode == "all":
        modes = _ALL_MODES
    else:
        modes = [m.strip() for m in args.mode.split(",") if m.strip()]
        invalid = [m for m in modes if m not in _DETECTOR_MAP]
        if invalid:
            print(f"ERROR: 알 수 없는 탐지기: {invalid}")
            sys.exit(1)

    from worker.ingest.supabase_writer import get_client
    sb = get_client()

    all_records: list[AnomalyRecord] = []
    counts_by_type: dict[str, int] = defaultdict(int)
    failed: list[str] = []

    for mode in modes:
        detector = _DETECTOR_MAP[mode](sb, detect_date)
        try:
            records = detector.run()
            all_records.extend(records)
            counts_by_type[mode] = len(records)
        except Exception as exc:
            logger.bind(detector=mode, error=str(exc)).exception("detector_failed")
            failed.append(mode)

    # ── 요약 출력 ──────────────────────────────────────────────────────────
    bar = "=" * 56
    print(f"\n{bar}")
    print(f"  이상탐지  날짜={detect_date}  {'[DRY-RUN]' if args.dry_run else ''}")
    print(f"  {'탐지기':<20} {'건수':>6}  {'평균 severity':>14}")
    print(f"  {'-'*20}  {'-'*6}  {'-'*14}")

    severity_by_type: dict[str, list[float]] = defaultdict(list)
    for r in all_records:
        severity_by_type[r.anomaly_type].append(r.severity)

    for t in _ALL_MODES:
        n   = counts_by_type.get(t, 0)
        svs = severity_by_type.get(t, [])
        avg = f"{sum(svs)/len(svs):.2f}" if svs else "  -   "
        marker = "  [FAILED]" if t in failed else ""
        print(f"  {t:<20}  {n:>6}  {avg:>14}{marker}")

    print(f"  {'-'*20}  {'-'*6}  {'-'*14}")
    print(f"  {'합계':<20}  {len(all_records):>6}")

    if failed:
        print(f"\n  실패한 탐지기: {', '.join(failed)}")

    # dry-run 일 때 severity TOP 10 미리보기
    if args.dry_run and all_records:
        top10 = sorted(all_records, key=lambda r: r.severity, reverse=True)[:10]
        print(f"\n  [DRY-RUN] severity 상위 10건:")
        print(f"  {'type':<20} {'severity':>8}  evidence (일부)")
        print(f"  {'-'*20}  {'-'*8}  {'-'*20}")
        for r in top10:
            ev_short = str(r.evidence)[:50]
            print(f"  {r.anomaly_type:<20}  {r.severity:>8.2f}  {ev_short}")

    print(f"{bar}\n")

    # ── INSERT ────────────────────────────────────────────────────────────
    if not args.dry_run:
        inserted = insert_anomalies_bulk(sb, all_records, dry_run=False)
        print(f"[INFO] anomalies INSERT: {inserted}건 (ON CONFLICT SKIP 포함)\n")
    else:
        print("[DRY-RUN] DB INSERT 생략.\n")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
