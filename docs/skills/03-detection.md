# Skill 03: Detection (이상탐지)

> 전일 대비 변화량을 계산하여 `anomalies` 테이블에 적재한다. 본 모듈은 **규칙 기반 + 통계 기반**의 단순한 탐지로 출발하고, ML 기반은 Phase 4 이후 검토.

## 1. 디렉토리

```
worker/detectors/
├── __init__.py
├── base.py              공통 인터페이스
├── rank_surge.py        랭킹 급상승
├── price_change.py      가격 변동
├── review_velocity.py   리뷰 폭증
├── new_entrant.py       신규 진입
├── promo_start.py       프로모션 신규
└── wishlist_surge.py    위시리스트 급증
```

## 2. 공통 인터페이스 (`base.py`)

```python
from dataclasses import dataclass
from datetime import date
from supabase import Client

@dataclass
class AnomalyRecord:
    product_id: str
    snapshot_id: str | None
    detected_on: date
    anomaly_type: str
    severity: float             # 0.0 ~ 1.0
    evidence: dict              # 탐지 근거 (전일값, 변화량, 임계치 등)

class BaseDetector:
    NAME: str                   # 'rank_surge', 'price_change', ...

    def __init__(self, sb: Client, detect_date: date):
        self.sb = sb
        self.detect_date = detect_date

    def run(self) -> list[AnomalyRecord]:
        """탐지 실행, AnomalyRecord 리스트 반환 (DB 적재는 별도)"""
        raise NotImplementedError
```

## 3. 탐지 규칙 6종

### 3.1 rank_surge (랭킹 급상승)

**규칙**: 어제 → 오늘 메인 랭킹이 20위 이상 상승.

**SQL** (참고):
```sql
with today as (
  select product_id, rank_main
  from product_snapshots
  where snapshot_date = $1 and rank_main is not null
),
yest as (
  select product_id, rank_main
  from product_snapshots
  where snapshot_date = $1 - 1 and rank_main is not null
)
select today.product_id,
       yest.rank_main as yesterday_rank,
       today.rank_main as today_rank,
       (yest.rank_main - today.rank_main) as delta
from today
join yest using (product_id)
where (yest.rank_main - today.rank_main) >= 20
order by delta desc;
```

**severity 계산**:
```python
def severity_rank_surge(delta: int, today_rank: int) -> float:
    # 상위권으로 진입할수록 가중치
    rank_weight = max(0.0, 1.0 - today_rank / 200)
    delta_weight = min(1.0, delta / 100)
    return round(0.5 * rank_weight + 0.5 * delta_weight, 2)
```

**evidence**:
```json
{
  "yesterday_rank": 73,
  "today_rank": 18,
  "delta": 55,
  "threshold": 20
}
```

### 3.2 price_change (가격 변동)

**규칙**:
- 가격 변동률이 절댓값 10% 이상 (`abs(today - yest) / yest >= 0.10`)
- 또는 신규 할인 적용 (`yest.discount_rate = 0 AND today.discount_rate > 0`)

**severity**: 변동률 절댓값 × 1.5 (max 1.0).

**evidence**:
```json
{
  "yesterday_price": 79000,
  "today_price": 49000,
  "delta_pct": -38.0,
  "yesterday_discount_rate": 0,
  "today_discount_rate": 38,
  "trigger": "discount_started"
}
```

### 3.3 review_velocity (리뷰 폭증)

**규칙**: 당일 신규 리뷰 수가 직전 14일 일평균의 3배 초과.

**계산**:
```sql
with recent as (
  select product_id, snapshot_date, new_review_count
  from review_snapshots
  where snapshot_date between $1 - 14 and $1 - 1
),
avg14 as (
  select product_id, avg(new_review_count) as avg_n
  from recent
  group by product_id
  having count(*) >= 7         -- 최소 데이터 요구
),
today as (
  select product_id, new_review_count
  from review_snapshots
  where snapshot_date = $1
)
select today.product_id, today.new_review_count, avg14.avg_n,
       (today.new_review_count / avg14.avg_n) as ratio
from today join avg14 using (product_id)
where today.new_review_count >= avg14.avg_n * 3
  and today.new_review_count >= 10        -- 절대 최소치
```

**severity**: `min(1.0, (ratio - 3.0) / 5.0)` (3배=0, 8배=1.0)

### 3.4 new_entrant (신규 진입)

**규칙**: 어제 Top 100에 없었는데 오늘 Top 100에 들어옴.

**severity**:
```python
def severity_new_entrant(today_rank: int) -> float:
    if today_rank <= 10: return 1.0
    if today_rank <= 30: return 0.7
    if today_rank <= 60: return 0.4
    return 0.2
```

**참고**: 진짜 "신규"는 `products.first_seen_at`이 최근일 때. 오래된 상품이 다시 Top 100에 들어온 건 "재진입"으로 별도 분류 가능 (Phase 2 확장).

### 3.5 promo_start (프로모션 신규)

**규칙**: 어제 promotions에 없던 product가 오늘 promotions에 등장.

**severity**: 할인율 / 100 (50% 할인=0.5).

**evidence**:
```json
{
  "promo_type": "time_deal",
  "discount_rate": 40,
  "ends_at": "2026-05-15T23:59:59+09:00"
}
```

### 3.6 wishlist_surge (위시리스트 급증)

**규칙**: 전일 대비 30% 이상 증가 AND 절대 증가량 100 이상.

**severity**: 증가율 / 2 (max 1.0).

## 4. 실행 흐름 (`main.py` 발췌)

```python
def run_detection(detect_date: date) -> None:
    sb = get_client()
    detectors = [
        RankSurgeDetector(sb, detect_date),
        PriceChangeDetector(sb, detect_date),
        ReviewVelocityDetector(sb, detect_date),
        NewEntrantDetector(sb, detect_date),
        PromoStartDetector(sb, detect_date),
        WishlistSurgeDetector(sb, detect_date),
    ]

    all_anomalies: list[AnomalyRecord] = []
    for d in detectors:
        try:
            results = d.run()
            logger.info(f"{d.NAME}: {len(results)} anomalies")
            all_anomalies.extend(results)
        except Exception as e:
            logger.exception(f"detector {d.NAME} failed: {e}")
            # 한 탐지기 실패는 다른 탐지기 영향 없음

    # 동일 product에 여러 anomaly 중복 가능 → 별도 row로 저장 (LLM이 종합 판단)
    insert_anomalies_bulk(sb, all_anomalies)
```

## 5. LLM에 넘기는 우선순위

LLM은 비싸므로 (latency 큼) 모든 anomaly를 분석하지 않는다:

```python
def select_for_analysis(date_: date, top_k: int = 50) -> list[dict]:
    """
    severity 내림차순 Top K.
    + 동일 product에 여러 anomaly_type 묶어서 1건으로.
    """
```

## 6. 새 탐지 규칙 추가 절차

1. `worker/detectors/` 에 새 파일 추가
2. `BaseDetector` 상속
3. `main.py`의 detectors 리스트에 추가
4. `anomalies.anomaly_type`에 새 enum 값 추가 (CHECK 제약 갱신, 마이그레이션)
5. LLM 프롬프트에 새 타입 설명 추가 (`05-agent-llm.md` 참조)

## 7. Phase 4 확장 백로그

- 이상치 통계 모델 (Isolation Forest 등) 도입
- 카테고리별 정규화된 점수 (어떤 카테고리는 변동이 큼)
- 시즌·요일 효과 보정 (월요일 랭킹은 주말 효과)
- 인접 상품 클러스터 단위 탐지 (브랜드 전체가 움직였는가)

## 8. 단위 테스트
- DB 픽스처: 어제·오늘 snapshot 2일치를 SQL로 시드
- 각 detector run() 호출 → 기대 AnomalyRecord와 비교
- severity 함수는 순수 함수라 단독 unittest
