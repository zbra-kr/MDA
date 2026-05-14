# Skill 04: Matching (자사-경쟁 매칭)

> 이상 경쟁상품에 대응하는 자사 상품을 찾고, Snowflake에서 자사 재고·가격·매출을 조인하여 비교 결과를 `product_matches`에 적재한다.

## 1. 디렉토리

```
worker/matchers/
├── __init__.py
├── snowflake_pull.py     자사 데이터 풀러
├── vector_match.py       pgvector 유사도 검색
└── combiner.py           매칭 결과 종합 (vector + 카테고리 + 가격대 + Snowflake)
```

## 2. 흐름

```
이상 경쟁상품 (anomaly의 product_id)
  ↓
1. 카테고리 매칭: 같은 musinsa_code 자사 상품 후보
  ↓
2. 벡터 유사도: pgvector cosine distance < 0.25 후보
  ↓
3. 가격대 필터: 자사 정상가 ±30% 범위
  ↓
4. Top N (보통 3~5건) 선정
  ↓
5. Snowflake에서 N건의 자사 SKU 데이터 조인 (재고·POS 가격·전일 매출)
  ↓
6. diff_summary 계산 후 product_matches insert
```

## 3. 벡터 매칭 (`vector_match.py`)

### 3.1 핵심 쿼리

Supabase RPC로 등록한 함수 사용 권장:

```sql
-- supabase/migrations/00002_pgvector.sql 에 등록
create or replace function match_own_products(
  competitor_id uuid,
  match_threshold float default 0.75,    -- cosine similarity 임계
  match_count int default 5
)
returns table (
  own_product_id uuid,
  similarity float,
  same_category boolean,
  price_diff_pct numeric
)
language sql stable as $$
  with comp as (
    select p.id, p.category_id, p.list_price, p.embedding
    from products p where p.id = competitor_id
  ),
  candidates as (
    select p.id as own_product_id,
           1 - (p.embedding <=> comp.embedding) as similarity,
           (p.category_id = comp.category_id) as same_category,
           case when comp.list_price > 0 then
             round(100.0 * (p.list_price - comp.list_price) / comp.list_price, 1)
             else null end as price_diff_pct
    from products p, comp
    join brands b on b.id = p.brand_id
    where b.is_own = true
      and p.id != competitor_id
      and p.embedding is not null
      and 1 - (p.embedding <=> comp.embedding) >= match_threshold
  )
  select * from candidates
  order by similarity desc
  limit match_count;
$$;
```

### 3.2 Python 호출

```python
def find_own_matches(sb: Client, competitor_product_id: str,
                     threshold: float = 0.75, top_n: int = 5) -> list[dict]:
    """
    Supabase RPC 호출.
    반환: [{"own_product_id": "...", "similarity": 0.91, "same_category": True, "price_diff_pct": -8.3}, ...]
    """
    res = sb.rpc("match_own_products", {
        "competitor_id": competitor_product_id,
        "match_threshold": threshold,
        "match_count": top_n,
    }).execute()
    return res.data
```

## 4. Snowflake 풀러 (`snowflake_pull.py`)

### 4.1 연결

```python
import snowflake.connector

def get_conn():
    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],   # 또는 key-pair
        warehouse=os.environ["SNOWFLAKE_WAREHOUSE"],
        database="BCAVE",
        schema="SEWON",
        role="SVC_COMPETITOR_RADAR_READER",          # read-only
    )
```

### 4.2 자사 상품 정보 조회

`products.own_sku`는 어떻게 채우는가:
- Phase 1에서는 수동 매핑 또는 musinsa_no ↔ SKU 매핑 테이블 별도 (`own_sku_map`)
- Phase 2 자동화: 자사 무신사 상품 페이지의 "상품번호" 표기를 파싱

### 4.3 핵심 함수

```python
def get_sku_snapshot(skus: list[str]) -> dict[str, dict]:
    """
    SKU 리스트로 Snowflake 한 번에 조회.
    반환: {sku: {field: value}}

    조회 필드:
      - 정상가 (MSRP)
      - 현재 POS 노출가
      - 가용재고 (창고 + 매장 합계)
      - 전일 매출 수량
      - 7일 평균 매출 수량
      - 7일 위시리스트/장바구니 증가 (있으면)
    """
    sql = """
    select
      sku_code,
      msrp_price,
      current_pos_price,
      total_stock_qty,
      sales_qty_yesterday,
      sales_qty_avg_7d
    from V_PRODUCT_DAILY_SNAPSHOT
    where sku_code in (...)
    """
    # ... 실행 후 dict로 변환
```

실제 컬럼·뷰 이름은 B.CAVE Snowflake 스키마에 맞춰 조정. 이슬비/은상이와 확인.

### 4.4 캐시

같은 분석 사이클 내에서 SKU 중복 조회 방지:
```python
_sku_cache: dict[str, dict] = {}

def get_sku_snapshot_cached(skus: list[str]) -> dict[str, dict]:
    missing = [s for s in skus if s not in _sku_cache]
    if missing:
        _sku_cache.update(get_sku_snapshot(missing))
    return {s: _sku_cache[s] for s in skus if s in _sku_cache}
```

## 5. 조합기 (`combiner.py`)

### 5.1 핵심 함수

```python
def build_match_records(
    sb: Client,
    competitor_product_id: str,
) -> list[dict]:
    """
    1. find_own_matches로 자사 후보 Top 5
    2. 후보의 own_sku 수집
    3. Snowflake에서 일괄 조회
    4. diff_summary 구성하여 product_matches insert 페이로드 반환
    """
```

### 5.2 diff_summary 구성

`DATA_MODEL.md` 참조. 예시 구조:
```json
{
  "price_diff_krw": -5000,
  "price_diff_pct": -8.3,
  "competitor_price": 65000,
  "own_price_msrp": 70000,
  "own_price_pos": 49000,
  "stock_status": "low",
  "stock_qty": 320,
  "sales_yesterday": 12,
  "sales_avg_7d": 18,
  "color_overlap": ["black", "cream"],
  "fit_diff": "competitor:loose vs own:regular"
}
```

### 5.3 stock_status 룰

```python
def stock_status(qty: int, avg_daily_sales: float) -> str:
    if qty <= 0: return "out"
    if avg_daily_sales <= 0: return "low"
    days_left = qty / avg_daily_sales
    if days_left < 7: return "critical"
    if days_left < 30: return "low"
    if days_left < 90: return "normal"
    return "overstock"
```

## 6. 색상·핏 매칭

상품의 색상·핏은 `products.description`에 자연어로 포함됨. 정확한 추출은 LLM 도움:
- Phase 1: 단순 키워드 매칭 (`'블랙' in description`)
- Phase 2: LLM에 "이 상품 설명에서 색상·핏을 JSON으로 추출" 호출 (사전 처리, 결과를 products 테이블 컬럼으로 추가)

## 7. 매칭 갱신 정책

- 신규 경쟁상품 발견 시: 즉시 매칭
- 자사 신상 등록 시: 해당 카테고리 경쟁상품 재매칭 (배치 작업)
- 모델/임베딩 교체 시: 전체 재매칭 (마이그레이션)

## 8. 단위 테스트
- Snowflake는 mock (`MagicMock`으로 dict 반환)
- pgvector RPC는 로컬 Supabase로 통합 테스트
- diff_summary 구성 로직은 순수 함수로 분리하여 단독 테스트

## 9. 거버넌스
- Snowflake 서비스 계정은 SELECT 권한만
- 조회 SQL은 모듈 상단에 상수로 보관 → 감사 가능
- 자사 매출 수치는 product_matches에 캐시되므로 RLS로 anon 접근 차단 (뷰어는 가공 후 보임)
