"""
LLM 출력 환각 검증기 (Phase 2.1 단계 E-3, ADR-025).

SKU 패턴을 LLM 출력에서 정규식으로 추출 → valid_skus 목록과 대조.
환각 발견 시 None 반환 + 로그.
"""

from __future__ import annotations

import json
import re

from loguru import logger

# SKU 패턴: 알파벳+숫자 조합 5~20자 (하이픈 포함). 실제 패턴은 Snowflake 확인 후 조정.
_SKU_PATTERN = re.compile(r"\b([A-Z0-9]{2,}[-_]?[A-Z0-9]{2,})\b")

_REQUIRED_KEYS = {"cause_hypothesis", "impact_on_own", "action", "action_detail", "priority"}
_VALID_ACTIONS  = {"price_match", "promo_match", "inventory_push", "monitor"}
_VALID_PRIORITY = {"high", "medium", "low"}


def parse_json_output(raw: str) -> dict | None:
    """LLM 출력에서 JSON 파싱. 실패 시 None."""
    text = raw.strip()
    # 코드블록 제거 (```json ... ``` 또는 ``` ... ```)
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$", "", text, flags=re.MULTILINE)
    text = text.strip()

    # 첫 번째 { } 블록만 추출
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start == -1 or end == 0:
        logger.warning("parse_json_output: JSON 블록 없음")
        return None

    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError as exc:
        logger.warning(f"parse_json_output: JSON 파싱 실패 — {exc}")
        return None


def validate_schema(data: dict) -> bool:
    """필수 키·값 범위 검증."""
    missing = _REQUIRED_KEYS - data.keys()
    if missing:
        logger.warning(f"validate_schema: 누락 키={missing}")
        return False
    if data.get("action") not in _VALID_ACTIONS:
        logger.warning(f"validate_schema: 잘못된 action={data.get('action')}")
        return False
    if data.get("priority") not in _VALID_PRIORITY:
        logger.warning(f"validate_schema: 잘못된 priority={data.get('priority')}")
        return False
    conf = data.get("confidence")
    if conf is not None and not (0.0 <= float(conf) <= 1.0):
        logger.warning(f"validate_schema: confidence 범위 오류={conf}")
        return False
    return True


def validate_sku_hallucination(output_text: str, valid_skus: set[str]) -> list[str]:
    """
    LLM 출력에서 SKU 패턴 추출 → valid_skus 대조.
    valid_skus에 없는 SKU가 있으면 해당 목록 반환 (빈 목록 = 환각 없음).
    """
    if not valid_skus:
        # 유효 SKU 목록 없으면 검증 불가 — 환각 없음으로 처리
        return []

    found_skus = set(_SKU_PATTERN.findall(output_text.upper()))
    hallucinated = [s for s in found_skus if s not in {v.upper() for v in valid_skus}]
    return hallucinated


def validate_output(
    raw: str,
    valid_skus: set[str],
    anomaly_id: str,
    attempt: int = 1,
) -> dict | None:
    """
    파싱 + 스키마 검증 + 환각 검증.
    통과 시 dict, 실패 시 None.
    """
    data = parse_json_output(raw)
    if data is None:
        logger.bind(anomaly_id=anomaly_id, attempt=attempt).warning("validate: JSON 파싱 실패")
        return None

    if not validate_schema(data):
        logger.bind(anomaly_id=anomaly_id, attempt=attempt).warning("validate: 스키마 검증 실패")
        return None

    hallucinated = validate_sku_hallucination(raw, valid_skus)
    if hallucinated:
        logger.bind(
            anomaly_id=anomaly_id,
            hallucinated_skus=hallucinated,
        ).warning("validate: 환각 SKU 발견 — 분석 폐기")
        return None

    return data
