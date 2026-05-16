from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from supabase import Client


@dataclass
class AnomalyRecord:
    product_id: str
    snapshot_id: str | None
    detected_on: date
    anomaly_type: str
    severity: float           # 0.0 ~ 1.0
    evidence: dict = field(default_factory=dict)


class BaseDetector:
    NAME: str  # 'rank_surge', 'price_change', ...

    def __init__(self, sb: Client, detect_date: date) -> None:
        self.sb = sb
        self.detect_date = detect_date

    def run(self) -> list[AnomalyRecord]:
        """탐지 실행. AnomalyRecord 리스트 반환 (DB 적재는 호출자 책임)."""
        raise NotImplementedError
