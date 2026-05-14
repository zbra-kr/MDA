# Skill 05: Agent (LLM 분석)

> 본 시스템의 두뇌. Qwen 2.5 14B로 이상상품과 자사 매칭 결과를 종합하여 전략 제안을 생성한다.

## 1. 디렉토리

```
worker/agent/
├── __init__.py
├── llm_client.py        Ollama OpenAI 호환 클라이언트
├── prompts.py           시스템·유저 프롬프트 (버전 관리)
├── analyst.py           파이프라인 (input 조립 → LLM → 파싱 → 저장)
└── validators.py        LLM 출력 검증 (JSON schema, 환각 검출)
```

## 2. 모델 선택 사유

`docs/DECISIONS.md` ADR-002 참조. 요약:
- 로컬 추론 (데이터 외부 유출 0)
- Qwen 2.5 14B Q4_K_M: 한국어 강함, 9GB VRAM
- Ollama: OpenAI 호환 API, Docker 친화

## 3. Ollama 클라이언트 (`llm_client.py`)

### 3.1 초기화

```python
from openai import OpenAI

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://ollama:11434/v1")
MODEL_NAME = "qwen2.5:14b-instruct-q4_K_M"

client = OpenAI(
    base_url=OLLAMA_HOST,
    api_key="ollama",   # placeholder, Ollama는 검증 안 함
)
```

### 3.2 호출 헬퍼

```python
def chat(messages: list[dict], temperature: float = 0.3,
         response_format: dict | None = None,
         timeout_s: float = 30.0) -> dict:
    """
    반환: {
      "text": str,           # raw response
      "tokens_in": int,
      "tokens_out": int,
      "latency_ms": int,
    }
    """
    t0 = time.monotonic()
    resp = client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        temperature=temperature,
        response_format=response_format,    # {"type": "json_object"} 권장
        timeout=timeout_s,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)
    return {
        "text": resp.choices[0].message.content,
        "tokens_in": resp.usage.prompt_tokens if resp.usage else None,
        "tokens_out": resp.usage.completion_tokens if resp.usage else None,
        "latency_ms": latency_ms,
    }
```

### 3.3 JSON 모드

Qwen 2.5는 JSON 모드 지원. 단 항상 완벽하지 않으니 `validators.py`에서 재검증.

## 4. 프롬프트 (`prompts.py`)

### 4.1 버전 관리

```python
SYSTEM_PROMPT_V1 = """
당신은 한국 패션 브랜드 B.CAVE의 IT팀에 소속된 시장 분석 어시스턴트다.
무신사에서 발견된 경쟁사 상품의 이상 징후와 자사(커버낫 등) 대응 상품 정보를 보고,
실무자가 즉시 활용 가능한 전략 제안을 한국어 JSON으로 출력한다.

원칙:
1. 자사 상품·수치는 입력된 데이터만 사용. 모르는 SKU나 매출은 추측 금지.
2. 가설은 "가설"이라 명시. 단정 금지.
3. 행동 권고는 다음 4개 중 선택: price_match | promo_match | inventory_push | monitor
4. priority는 high/medium/low.
5. 출력은 반드시 JSON 한 개. 코드블록 금지.

출력 스키마:
{
  "cause_hypothesis": "<원인 가설, 1~2문장>",
  "impact_on_own": "<자사 영향, 1~2문장>",
  "action": "<위 4개 중 1개>",
  "action_detail": "<구체적 실행 방안, 1~2문장>",
  "priority": "<high|medium|low>",
  "confidence": <0.0~1.0>
}
"""

PROMPT_VERSION = "v1"
```

### 4.2 유저 프롬프트 빌더

```python
def build_user_prompt(competitor_info: dict, anomalies: list[dict],
                      own_matches: list[dict]) -> str:
    """
    competitor_info: 경쟁상품 메타 (이름, 브랜드, 카테고리, 가격)
    anomalies: 해당 상품의 이상 징후들 (type, severity, evidence)
    own_matches: 자사 매칭 결과 (similarity, diff_summary 포함)
    """
    return f"""
## 경쟁사 상품
- 브랜드: {competitor_info['brand_name']}
- 상품명: {competitor_info['product_name']}
- 카테고리: {competitor_info['category_path']}
- 현재 가격: {competitor_info['current_price']:,}원
- 정상가: {competitor_info['list_price']:,}원

## 오늘 탐지된 이상 징후
{format_anomalies(anomalies)}

## 자사 매칭 상품 (Top {len(own_matches)})
{format_own_matches(own_matches)}

## 요청
위 정보를 종합하여 시스템 프롬프트의 JSON 스키마대로 답하라.
"""
```

### 4.3 anomalies 포맷팅

```python
def format_anomalies(anomalies: list[dict]) -> str:
    lines = []
    for a in anomalies:
        e = a["evidence"]
        if a["anomaly_type"] == "rank_surge":
            lines.append(f"- 랭킹 급상승: {e['yesterday_rank']}위 → {e['today_rank']}위 (Δ{e['delta']})")
        elif a["anomaly_type"] == "price_change":
            lines.append(f"- 가격 변동: {e['yesterday_price']:,}원 → {e['today_price']:,}원 ({e['delta_pct']:+.1f}%)")
        elif a["anomaly_type"] == "review_velocity":
            lines.append(f"- 리뷰 폭증: 당일 {e['today_count']}건 (14일 평균 {e['avg_n']:.1f}건의 {e['ratio']:.1f}배)")
        # ... 나머지 타입
    return "\n".join(lines)
```

### 4.4 own_matches 포맷팅

```python
def format_own_matches(matches: list[dict]) -> str:
    if not matches:
        return "(자사에 유사 상품 없음)"
    lines = []
    for m in matches:
        d = m["diff_summary"]
        lines.append(f"""
- {m['own_product_name']} (SKU: {m['own_sku']})
  - 유사도: {m['similarity']:.2f}
  - 자사 정상가: {d['own_price_msrp']:,}원 / POS가: {d['own_price_pos']:,}원
  - 가격차: {d['price_diff_krw']:+,}원 ({d['price_diff_pct']:+.1f}%)
  - 재고: {d['stock_qty']}개 ({d['stock_status']})
  - 7일 평균 매출: {d['sales_avg_7d']}개/일
""")
    return "\n".join(lines)
```

## 5. 분석 파이프라인 (`analyst.py`)

### 5.1 진입

```python
def analyze_anomaly_group(sb: Client, product_id: str,
                          detect_date: date) -> dict | None:
    """
    한 상품에 묶인 anomaly들 종합 분석.
    반환: 저장된 agent_analysis row의 id, 또는 실패 시 None.
    """
    # 1. 입력 조립
    competitor_info = fetch_product_with_brand_category(sb, product_id)
    anomalies = fetch_anomalies(sb, product_id, detect_date)
    own_matches = fetch_product_matches(sb, product_id)

    # 2. 프롬프트
    user_msg = build_user_prompt(competitor_info, anomalies, own_matches)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_V1},
        {"role": "user", "content": user_msg},
    ]

    # 3. 호출
    try:
        result = chat(messages, response_format={"type": "json_object"})
    except Exception as e:
        logger.exception(f"LLM call failed for {product_id}: {e}")
        return None

    # 4. 파싱 + 검증
    parsed = validate_and_parse(result["text"], own_skus=[m["own_sku"] for m in own_matches])
    if parsed is None:
        logger.warning(f"LLM output validation failed: {result['text'][:200]}")
        return None

    # 5. 저장 (anomaly 1건당 1개 분석. 같은 product의 여러 anomaly는 첫 번째에 묶음)
    analysis_id = insert_agent_analysis(sb, {
        "anomaly_id": anomalies[0]["id"],
        "model_version": MODEL_NAME,
        "prompt_version": PROMPT_VERSION,
        "llm_reasoning": result["text"],
        "strategy_recommendation": parsed,
        "tokens_in": result["tokens_in"],
        "tokens_out": result["tokens_out"],
        "latency_ms": result["latency_ms"],
    })
    return analysis_id
```

### 5.2 배치 실행

```python
def run_daily_analysis(detect_date: date, top_k: int = 50) -> None:
    sb = get_client()
    # severity 기준 Top K product
    candidates = select_for_analysis(sb, detect_date, top_k)
    for c in candidates:
        analyze_anomaly_group(sb, c["product_id"], detect_date)
```

## 6. 출력 검증 (`validators.py`)

### 6.1 JSON 스키마 검증

```python
from pydantic import BaseModel, Field, field_validator

class StrategyRecommendation(BaseModel):
    cause_hypothesis: str = Field(min_length=10, max_length=500)
    impact_on_own: str = Field(min_length=10, max_length=500)
    action: Literal["price_match", "promo_match", "inventory_push", "monitor"]
    action_detail: str = Field(min_length=10, max_length=500)
    priority: Literal["high", "medium", "low"]
    confidence: float = Field(ge=0.0, le=1.0)
```

### 6.2 환각 검출

LLM이 입력에 없는 SKU나 가격을 만들어내는 경우 차단:

```python
def detect_hallucination(llm_text: str, valid_skus: list[str]) -> list[str]:
    """LLM 텍스트에 등장한 SKU 패턴 중 valid_skus에 없는 것 반환"""
    # 정규식으로 SKU 패턴 추출 후 valid_skus와 대조
    ...
```

### 6.3 종합 검증

```python
def validate_and_parse(raw_text: str, own_skus: list[str]) -> dict | None:
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        # 코드블록 감싸진 경우 처리
        cleaned = strip_code_fence(raw_text)
        try:
            data = json.loads(cleaned)
        except Exception:
            return None

    try:
        rec = StrategyRecommendation(**data)
    except ValidationError:
        return None

    # 환각 검출
    hallucinated = detect_hallucination(rec.action_detail, own_skus)
    if hallucinated:
        logger.warning(f"hallucinated SKUs: {hallucinated}")
        return None

    return rec.model_dump()
```

## 7. 프롬프트 튜닝 절차

1. v1 프롬프트로 50건 분석
2. IT팀장이 결과 검토 (Good/Bad/Ugly 분류)
3. Bad/Ugly 케이스의 입력·출력을 모아 패턴 도출
4. 시스템 프롬프트 수정 → v2로 버전 업
5. 같은 50건 재분석 → 개선 비교
6. v1 vs v2 결과는 `agent_analyses.prompt_version`으로 분리되어 비교 가능

## 8. latency 최적화

Qwen 14B Q4_K_M, 8-16GB GPU에서 예상 latency:
- 입력 1000 토큰, 출력 300 토큰 → 약 8~15초/건
- 50건 → 약 7~12분
- 새벽 03:00~07:00 윈도우 내 충분

오버할 경우:
- 분석 대상 Top K 줄이기 (50 → 30)
- 출력 토큰 제한 (max_tokens=400)
- 입력 컨텍스트 축소 (own_matches Top 5 → 3)

## 9. 모니터링 지표

- `agent_analyses`에서 일별 평균 latency, p95
- JSON 파싱 실패율
- 환각 검출 건수
- 사람 피드백 (대시보드에서 별점)

## 10. 단위 테스트

- LLM 호출 mock (`unittest.mock`으로 chat() 패치)
- 검증 함수는 순수 → 다양한 raw_text 케이스로 테스트
- 프롬프트 빌더는 fixture로 일관성 확인

## 11. 거버넌스
- 모든 프롬프트는 Git에 커밋, 비밀 정보 미포함
- 환각/오작동 발생 시 `agent_analyses.id` 기록 후 IT팀장에게 보고
- 프롬프트 변경은 PR 리뷰 (DT파트 + IT팀장)
- AX 위원회 결정사항: 본 LLM은 ERP/POS에 쓰기 권한 없음. 읽기 데이터만 분석.
