"""
LLM 프롬프트 v1 (Phase 2.1 단계 E-2).

prompt_version = "v1"
"""

from __future__ import annotations

PROMPT_VERSION = "v1"

# ─── 시스템 프롬프트 ─────────────────────────────────────────────────────────

SYSTEM_PROMPT = """당신은 한국 패션 브랜드 B.CAVE의 IT팀에 소속된 시장 분석 어시스턴트다.
무신사에서 발견된 경쟁사 상품의 이상 징후와 자사(커버낫 등) 대응 상품 정보를 보고,
실무자가 즉시 활용 가능한 전략 제안을 한국어 JSON으로 출력한다.

원칙:
1. 자사 상품·수치는 입력된 데이터만 사용. 모르는 SKU나 매출은 추측 금지.
2. 가설은 "가설"이라 명시. 단정 금지.
3. 행동 권고: price_match | promo_match | inventory_push | monitor 중 하나.
4. priority: high / medium / low.
5. 출력은 JSON 1개만. 코드블록 없이 JSON만 출력.

출력 JSON 스키마:
{
  "cause_hypothesis": "원인 가설 1~2문장",
  "impact_on_own": "자사 영향 1~2문장",
  "action": "price_match",
  "action_detail": "구체적 실행 방안 1~2문장",
  "priority": "high",
  "confidence": 0.82
}"""

JSON_HINT_SUFFIX = "\n\n※ JSON 1개만 출력. 코드블록·설명 없이."


# ─── 유저 프롬프트 빌더 ─────────────────────────────────────────────────────

ANOMALY_LABEL: dict[str, str] = {
    "rank_surge":      "랭킹 급상승",
    "price_change":    "가격 변동",
    "review_velocity": "리뷰 폭증",
    "new_entrant":     "신규 진입",
    "promo_start":     "프로모션 시작",
    "wishlist_surge":  "위시리스트 급증",
}


def _fmt_krw(v: int | float | None) -> str:
    if v is None:
        return "—"
    return f"{int(v):,}원"


def _evidence_lines(anomaly_type: str, evidence: dict) -> list[str]:
    lines: list[str] = []
    if anomaly_type == "rank_surge":
        lines.append(
            f"  - rank_surge: {evidence.get('yesterday_rank')}위 → "
            f"{evidence.get('today_rank')}위 (Δ{evidence.get('delta')})"
        )
    elif anomaly_type == "price_change":
        lines.append(
            f"  - price_change: {_fmt_krw(evidence.get('yesterday_price'))} → "
            f"{_fmt_krw(evidence.get('today_price'))} ({evidence.get('delta_pct')}%)"
        )
    elif anomaly_type == "review_velocity":
        lines.append(
            f"  - review_velocity: 14일 평균 {evidence.get('avg_n')}건 대비 "
            f"오늘 {evidence.get('today_count')}건 ({evidence.get('ratio')}x)"
        )
    elif anomaly_type == "new_entrant":
        lines.append(f"  - new_entrant: 오늘 {evidence.get('today_rank')}위 진입 (어제 권외)")
    elif anomaly_type == "promo_start":
        lines.append(
            f"  - promo_start: {evidence.get('promo_type')} "
            f"할인율={evidence.get('discount_rate')}%"
        )
    elif anomaly_type == "wishlist_surge":
        lines.append(
            f"  - wishlist_surge: {evidence.get('prev'):,} → {evidence.get('today'):,} "
            f"(+{evidence.get('delta_pct')}%)"
        )
    else:
        lines.append(f"  - {anomaly_type}: {evidence}")
    return lines


def build_user_prompt(
    anomaly: dict,
    product: dict,
    brand: dict,
    matches: list[dict],
    hint: bool = False,
) -> str:
    """
    단일 anomaly 기준 유저 프롬프트 생성.

    anomaly: {anomaly_type, severity, evidence, detected_on}
    product: {name, current_price, list_price, review_count, musinsa_no}
    brand:   {name, slug}
    matches: [{sku_code, product_name, similarity_score, diff_summary}]
    """
    a_label  = ANOMALY_LABEL.get(anomaly["anomaly_type"], anomaly["anomaly_type"])
    evidence = anomaly.get("evidence") or {}

    lines: list[str] = [
        "## 경쟁사 상품",
        f"브랜드: {brand.get('name', '—')} (슬러그: {brand.get('slug', '—')})",
        f"상품명: {product.get('name', '—')}",
        f"현재가: {_fmt_krw(product.get('current_price'))} / 정상가: {_fmt_krw(product.get('list_price'))}",
        f"리뷰 수: {product.get('review_count') or '—'}건",
        "",
        "## 탐지된 이상 징후",
        f"탐지 날짜: {anomaly.get('detected_on')} / 심각도: {anomaly.get('severity')}",
        f"탐지 유형: {a_label}",
    ]

    lines += _evidence_lines(anomaly["anomaly_type"], evidence)

    lines += ["", "## 자사 매칭 상품"]
    if matches:
        for i, m in enumerate(matches[:3], 1):
            ds = m.get("diff_summary") or {}
            lines.append(
                f"  [{i}] SKU={m.get('sku_code', '—')} | {m.get('product_name', '—')} | "
                f"유사도={m.get('similarity_score', 0):.2f}"
            )
            if ds:
                lines.append(
                    f"      정상가={_fmt_krw(ds.get('own_price_msrp'))} | "
                    f"POS가={_fmt_krw(ds.get('own_price_pos'))} | "
                    f"재고상태={ds.get('stock_status', '—')} | "
                    f"재고={ds.get('stock_qty', '—')}개 | "
                    f"7일매출={ds.get('sales_avg_7d', '—')}개/일"
                )
    else:
        lines.append("  매칭된 자사 상품 없음.")

    lines += [
        "",
        "## 요청",
        "위 정보를 바탕으로 JSON 스키마에 맞게 전략 분석을 출력하라.",
    ]

    prompt = "\n".join(lines)
    if hint:
        prompt += JSON_HINT_SUFFIX
    return prompt
