from __future__ import annotations

from datetime import date, timedelta

from loguru import logger
from supabase import Client

from worker.detectors._thresholds import WISHLIST_SURGE_MIN_ABS, WISHLIST_SURGE_MIN_PCT
from worker.detectors.base import AnomalyRecord, BaseDetector


def _severity(pct_increase: float) -> float:
    return round(min(1.0, pct_increase / 200), 2)


class WishlistSurgeDetector(BaseDetector):
    NAME = "wishlist_surge"

    def run(self) -> list[AnomalyRecord]:
        yesterday = self.detect_date - timedelta(days=1)

        resp_today = (
            self.sb.table("product_snapshots")
            .select("id, product_id, wishlist_count")
            .eq("snapshot_date", self.detect_date.isoformat())
            .not_.is_("wishlist_count", "null")
            .execute()
        )
        resp_yest = (
            self.sb.table("product_snapshots")
            .select("product_id, wishlist_count")
            .eq("snapshot_date", yesterday.isoformat())
            .not_.is_("wishlist_count", "null")
            .execute()
        )

        today_map = {r["product_id"]: r for r in resp_today.data}
        yest_map  = {r["product_id"]: r["wishlist_count"] for r in resp_yest.data}

        results: list[AnomalyRecord] = []
        for pid, t in today_map.items():
            if pid not in yest_map:
                continue
            yest_count  = yest_map[pid]
            today_count = t["wishlist_count"]
            if yest_count == 0:
                continue
            abs_diff  = today_count - yest_count
            pct_increase = abs_diff / yest_count * 100
            if pct_increase >= WISHLIST_SURGE_MIN_PCT and abs_diff >= WISHLIST_SURGE_MIN_ABS:
                results.append(AnomalyRecord(
                    product_id   = pid,
                    snapshot_id  = t["id"],
                    detected_on  = self.detect_date,
                    anomaly_type = self.NAME,
                    severity     = _severity(pct_increase),
                    evidence     = {
                        "yesterday_wishlist": yest_count,
                        "today_wishlist":     today_count,
                        "abs_diff":          abs_diff,
                        "pct_increase":      round(pct_increase, 1),
                        "threshold_pct":     WISHLIST_SURGE_MIN_PCT,
                        "threshold_abs":     WISHLIST_SURGE_MIN_ABS,
                    },
                ))

        logger.bind(detector=self.NAME, date=self.detect_date, count=len(results)).info("detector_done")
        return results
