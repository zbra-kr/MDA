from __future__ import annotations

from datetime import date, timedelta

from loguru import logger
from supabase import Client

from worker.detectors._thresholds import REVIEW_VELOCITY_MIN_COUNT, REVIEW_VELOCITY_RATIO
from worker.detectors.base import AnomalyRecord, BaseDetector

_LOOKBACK_DAYS = 14
_MIN_DATA_DAYS = 7  # 최소 7일 데이터 없으면 건너뜀 (R7 리스크 대응)


def _severity(ratio: float) -> float:
    # 3배=0, 8배=1.0
    return round(min(1.0, (ratio - REVIEW_VELOCITY_RATIO) / 5.0), 2)


class ReviewVelocityDetector(BaseDetector):
    NAME = "review_velocity"

    def run(self) -> list[AnomalyRecord]:
        window_start = self.detect_date - timedelta(days=_LOOKBACK_DAYS)
        window_end   = self.detect_date - timedelta(days=1)

        # 직전 14일 daily new_review_count
        resp_hist = (
            self.sb.table("review_snapshots")
            .select("product_id, snapshot_date, new_review_count")
            .gte("snapshot_date", window_start.isoformat())
            .lte("snapshot_date", window_end.isoformat())
            .not_.is_("new_review_count", "null")
            .execute()
        )

        # 오늘 new_review_count
        resp_today = (
            self.sb.table("review_snapshots")
            .select("id, product_id, new_review_count")
            .eq("snapshot_date", self.detect_date.isoformat())
            .not_.is_("new_review_count", "null")
            .execute()
        )

        # 14일 평균 계산 (최소 _MIN_DATA_DAYS 일 이상 있어야 함)
        hist_by_product: dict[str, list[int]] = {}
        for r in resp_hist.data:
            hist_by_product.setdefault(r["product_id"], []).append(r["new_review_count"])

        avg_map: dict[str, float] = {}
        for pid, counts in hist_by_product.items():
            if len(counts) >= _MIN_DATA_DAYS:
                avg_map[pid] = sum(counts) / len(counts)

        results: list[AnomalyRecord] = []
        for r in resp_today.data:
            pid = r["product_id"]
            if pid not in avg_map:
                continue  # 데이터 부족 — 건너뜀
            today_count = r["new_review_count"]
            avg14       = avg_map[pid]
            if avg14 == 0:
                continue
            ratio = today_count / avg14
            if ratio >= REVIEW_VELOCITY_RATIO and today_count >= REVIEW_VELOCITY_MIN_COUNT:
                results.append(AnomalyRecord(
                    product_id   = pid,
                    snapshot_id  = r["id"],
                    detected_on  = self.detect_date,
                    anomaly_type = self.NAME,
                    severity     = _severity(ratio),
                    evidence     = {
                        "today_new_reviews":    today_count,
                        "avg_14d":              round(avg14, 1),
                        "ratio":                round(ratio, 2),
                        "threshold_ratio":      REVIEW_VELOCITY_RATIO,
                        "threshold_min_count":  REVIEW_VELOCITY_MIN_COUNT,
                    },
                ))

        logger.bind(detector=self.NAME, date=self.detect_date, count=len(results)).info("detector_done")
        return results
