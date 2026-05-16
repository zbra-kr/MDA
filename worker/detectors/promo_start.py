from __future__ import annotations

from datetime import date, timedelta

from loguru import logger
from supabase import Client

from worker.detectors.base import AnomalyRecord, BaseDetector


class PromoStartDetector(BaseDetector):
    NAME = "promo_start"

    def run(self) -> list[AnomalyRecord]:
        yesterday = self.detect_date - timedelta(days=1)

        # 오늘 discovered_at 인 프로모션 (discovered_at::date = today)
        resp_today = (
            self.sb.table("promotions")
            .select("id, product_id, promo_type, discount_rate, ends_at")
            .gte("discovered_at", self.detect_date.isoformat())
            .lt("discovered_at", (self.detect_date + timedelta(days=1)).isoformat())
            .execute()
        )

        # 어제까지 이미 존재하던 product_id 집합
        resp_yest = (
            self.sb.table("promotions")
            .select("product_id")
            .lt("discovered_at", self.detect_date.isoformat())
            .execute()
        )

        existing_pids = {r["product_id"] for r in resp_yest.data}

        results: list[AnomalyRecord] = []
        seen_today: set[str] = set()
        for r in resp_today.data:
            pid = r["product_id"]
            if pid in existing_pids:
                continue  # 기존 상품 프로모션 갱신 — 신규 아님
            if pid in seen_today:
                continue  # 오늘 같은 상품 중복 방지
            seen_today.add(pid)

            dr = r.get("discount_rate") or 0
            results.append(AnomalyRecord(
                product_id   = pid,
                snapshot_id  = None,  # promotions에는 snapshot_id 없음
                detected_on  = self.detect_date,
                anomaly_type = self.NAME,
                severity     = round(min(1.0, dr / 100), 2),
                evidence     = {
                    "promo_type":    r.get("promo_type"),
                    "discount_rate": dr,
                    "ends_at":       r.get("ends_at"),
                },
            ))

        logger.bind(detector=self.NAME, date=self.detect_date, count=len(results)).info("detector_done")
        return results
