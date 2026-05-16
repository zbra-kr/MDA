from __future__ import annotations

from datetime import date, timedelta

from loguru import logger
from supabase import Client

from worker.detectors._thresholds import PRICE_CHANGE_MIN_PCT
from worker.detectors.base import AnomalyRecord, BaseDetector


def _severity(delta_pct: float) -> float:
    return round(min(1.0, abs(delta_pct) / 100 * 1.5), 2)


class PriceChangeDetector(BaseDetector):
    NAME = "price_change"

    def run(self) -> list[AnomalyRecord]:
        yesterday = self.detect_date - timedelta(days=1)

        resp_today = (
            self.sb.table("product_snapshots")
            .select("id, product_id, current_price, discount_rate")
            .eq("snapshot_date", self.detect_date.isoformat())
            .execute()
        )
        resp_yest = (
            self.sb.table("product_snapshots")
            .select("product_id, current_price, discount_rate")
            .eq("snapshot_date", yesterday.isoformat())
            .execute()
        )

        today_map = {r["product_id"]: r for r in resp_today.data}
        yest_map  = {r["product_id"]: r for r in resp_yest.data}

        results: list[AnomalyRecord] = []
        for pid, t in today_map.items():
            if pid not in yest_map:
                continue
            y = yest_map[pid]
            if not y["current_price"]:
                continue

            today_price = t["current_price"]
            yest_price  = y["current_price"]
            delta_pct   = (today_price - yest_price) / yest_price * 100

            today_dr = t.get("discount_rate") or 0
            yest_dr  = y.get("discount_rate") or 0
            discount_started = yest_dr == 0 and today_dr > 0

            triggered = abs(delta_pct) >= PRICE_CHANGE_MIN_PCT or discount_started
            if not triggered:
                continue

            trigger_label = "discount_started" if discount_started else (
                "price_drop" if delta_pct < 0 else "price_rise"
            )
            results.append(AnomalyRecord(
                product_id   = pid,
                snapshot_id  = t["id"],
                detected_on  = self.detect_date,
                anomaly_type = self.NAME,
                severity     = _severity(delta_pct if not discount_started else today_dr),
                evidence     = {
                    "yesterday_price":         yest_price,
                    "today_price":             today_price,
                    "delta_pct":               round(delta_pct, 1),
                    "yesterday_discount_rate": yest_dr,
                    "today_discount_rate":     today_dr,
                    "trigger":                 trigger_label,
                    "threshold_pct":           PRICE_CHANGE_MIN_PCT,
                },
            ))

        logger.bind(detector=self.NAME, date=self.detect_date, count=len(results)).info("detector_done")
        return results
