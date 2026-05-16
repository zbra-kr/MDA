from __future__ import annotations

from datetime import date, timedelta

from loguru import logger
from supabase import Client

from worker.detectors._thresholds import NEW_ENTRANT_TOP_N
from worker.detectors.base import AnomalyRecord, BaseDetector


def _severity(today_rank: int) -> float:
    if today_rank <= 10:  return 1.0
    if today_rank <= 30:  return 0.7
    if today_rank <= 60:  return 0.4
    return 0.2


class NewEntrantDetector(BaseDetector):
    NAME = "new_entrant"

    def run(self) -> list[AnomalyRecord]:
        yesterday = self.detect_date - timedelta(days=1)

        resp_today = (
            self.sb.table("product_snapshots")
            .select("id, product_id, rank_main")
            .eq("snapshot_date", self.detect_date.isoformat())
            .not_.is_("rank_main", "null")
            .lte("rank_main", NEW_ENTRANT_TOP_N)
            .execute()
        )
        resp_yest = (
            self.sb.table("product_snapshots")
            .select("product_id")
            .eq("snapshot_date", yesterday.isoformat())
            .not_.is_("rank_main", "null")
            .lte("rank_main", NEW_ENTRANT_TOP_N)
            .execute()
        )

        yest_in_top = {r["product_id"] for r in resp_yest.data}

        results: list[AnomalyRecord] = []
        for r in resp_today.data:
            pid = r["product_id"]
            if pid in yest_in_top:
                continue  # 어제도 Top N에 있었음 — 신규 진입 아님
            today_rank = r["rank_main"]
            results.append(AnomalyRecord(
                product_id   = pid,
                snapshot_id  = r["id"],
                detected_on  = self.detect_date,
                anomaly_type = self.NAME,
                severity     = _severity(today_rank),
                evidence     = {
                    "today_rank":    today_rank,
                    "top_n":         NEW_ENTRANT_TOP_N,
                    "yesterday_rank": None,  # 어제 Top N 밖 또는 미등장
                },
            ))

        logger.bind(detector=self.NAME, date=self.detect_date, count=len(results)).info("detector_done")
        return results
