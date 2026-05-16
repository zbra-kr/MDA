from __future__ import annotations

from datetime import date, timedelta

from loguru import logger
from supabase import Client

from worker.detectors._thresholds import RANK_SURGE_MIN_DELTA
from worker.detectors.base import AnomalyRecord, BaseDetector


def _severity(delta: int, today_rank: int) -> float:
    rank_weight = max(0.0, 1.0 - today_rank / 200)
    delta_weight = min(1.0, delta / 100)
    return round(0.5 * rank_weight + 0.5 * delta_weight, 2)


class RankSurgeDetector(BaseDetector):
    NAME = "rank_surge"

    def run(self) -> list[AnomalyRecord]:
        yesterday = self.detect_date - timedelta(days=1)

        # 어제·오늘 두 날짜의 rank_main 조회
        resp_today = (
            self.sb.table("product_snapshots")
            .select("id, product_id, rank_main")
            .eq("snapshot_date", self.detect_date.isoformat())
            .not_.is_("rank_main", "null")
            .execute()
        )
        resp_yest = (
            self.sb.table("product_snapshots")
            .select("product_id, rank_main")
            .eq("snapshot_date", yesterday.isoformat())
            .not_.is_("rank_main", "null")
            .execute()
        )

        today_map = {r["product_id"]: r for r in resp_today.data}
        yest_map  = {r["product_id"]: r["rank_main"] for r in resp_yest.data}

        results: list[AnomalyRecord] = []
        for pid, t in today_map.items():
            if pid not in yest_map:
                continue
            yest_rank  = yest_map[pid]
            today_rank = t["rank_main"]
            delta = yest_rank - today_rank  # 양수 = 상승 (숫자 감소)
            if delta >= RANK_SURGE_MIN_DELTA:
                results.append(AnomalyRecord(
                    product_id  = pid,
                    snapshot_id = t["id"],
                    detected_on = self.detect_date,
                    anomaly_type = self.NAME,
                    severity    = _severity(delta, today_rank),
                    evidence    = {
                        "yesterday_rank": yest_rank,
                        "today_rank":     today_rank,
                        "delta":          delta,
                        "threshold":      RANK_SURGE_MIN_DELTA,
                    },
                ))

        logger.bind(detector=self.NAME, date=self.detect_date, count=len(results)).info("detector_done")
        return results
