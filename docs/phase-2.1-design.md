# Phase 2.1 설계 문서 — 이상탐지·자사매칭·LLM 분석

> 작성: 2026-05-16 / 오너: 정호철 (IT팀장)
> 세부 구현 가이드: `docs/skills/03-detection.md`, `04-matching.md`, `05-agent-llm.md`

---

## 1. 배경·선행 조건

Phase 2.1은 본 시스템의 **핵심 가치**다. 무신사에서 이상 경쟁상품을 탐지하고, 자사 대응 상품을 찾고, LLM이 전략을 제안한다.

**선행 조건**:
- Phase 1 자동화 7일 이상 무인 가동 완료 (검증 게이트 1 통과)
- `product_snapshots` 최소 7일 누적 (탐지 기준선 확보)
- `review_snapshots` 14일 누적 (review_velocity 탐지 선행 조건)
- GPU 서버에 Ollama 설치 가능한 상태 확인 (VRAM ≥ 10GB)
- Phase 2.0 미완료여도 Phase 2.1 개발은 병행 가능. 단 **viewer 인증 게이트(Phase 2.0)는 Vercel 배포 전 필수**.

---

## 2. 이상탐지 6종 상세

> 탐지기 구현 인터페이스: `docs/skills/03-detection.md` `BaseDetector`

### 2.1 입력 테이블 및 컬럼

| 탐지기 | 입력 테이블 | 핵심 컬럼 |
|---|---|---|
| rank_surge | product_snapshots | product_id, snapshot_date, rank_main |
| price_change | product_snapshots | product_id, snapshot_date, current_price, list_price, discount_rate |
| review_velocity | review_snapshots | product_id, snapshot_date, new_review_count |
| new_entrant | product_snapshots | product_id, snapshot_date, rank_main |
| promo_start | promotions | product_id, created_at, promo_type, discount_rate, ends_at |
| wishlist_surge | product_snapshots | product_id, snapshot_date, wishlist_count |

### 2.2 임계값 상수 (코드 상수로 고정, 변경 시 PR)

> ADR-024: 임계값은 코드 상수. DB 설정 테이블로 이동하는 건 Phase 4 이후 검토.

```python
# worker/detectors/_thresholds.py
RANK_SURGE_MIN_DELTA      = 20      # 20위 이상 상승
PRICE_CHANGE_MIN_PCT      = 10.0    # 10% 이상 변동
REVIEW_VELOCITY_RATIO     = 3.0     # 14일 평균 3배 초과
REVIEW_VELOCITY_MIN_COUNT = 10      # 절대 최소 10건
NEW_ENTRANT_TOP_N         = 100     # Top 100 기준
PROMO_START_TRIGGER       = "new"   # 어제 없던 상품의 신규 프로모션
WISHLIST_SURGE_MIN_PCT    = 30.0    # 30% 이상 증가
WISHLIST_SURGE_MIN_ABS    = 100     # 절대 100 이상
```

### 2.3 탐지기별 severity 공식

```
rank_surge:       0.5 * (1.0 - today_rank/200) + 0.5 * min(1.0, delta/100)
price_change:     min(1.0, abs(delta_pct) / 100 * 1.5)
review_velocity:  min(1.0, (ratio - 3.0) / 5.0)     # 3배=0, 8배=1.0
new_entrant:      1.0 / 0.7 / 0.4 / 0.2  (top10/top30/top60/기타)
promo_start:      discount_rate / 100
wishlist_surge:   min(1.0, pct_increase / 200)
```

### 2.4 anomalies 테이블 스케치 (00015)

```sql
create table if not exists anomalies (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id),
  snapshot_id     uuid references product_snapshots(id),
  detected_on     date not null,
  anomaly_type    text not null
    check (anomaly_type in (
      'rank_surge','price_change','review_velocity',
      'new_entrant','promo_start','wishlist_surge'
    )),
  severity        numeric(3,2) not null check (severity between 0 and 1),
  evidence        jsonb not null default '{}',
  analyzed        boolean not null default false,   -- LLM 분석 완료 여부
  created_at      timestamptz not null default now()
);

-- 인덱스
create index anomalies_detected_on_idx    on anomalies(detected_on desc);
create index anomalies_product_id_idx     on anomalies(product_id);
create index anomalies_severity_idx       on anomalies(severity desc);
create index anomalies_type_idx           on anomalies(anomaly_type);
create index anomalies_not_analyzed_idx   on anomalies(detected_on) where analyzed = false;

-- UNIQUE: 같은 날 같은 상품 + 같은 탐지 타입은 1개만
create unique index anomalies_dedup_idx
  on anomalies(product_id, detected_on, anomaly_type);

-- RLS
alter table anomalies enable row level security;
create policy "anon read anomalies" on anomalies for select to anon using (true);
```

---

## 3. 자사 매칭

> 구현 상세: `docs/skills/04-matching.md`

### 3.1 Snowflake 풀러 (`worker/matchers/snowflake_pull.py`)

**환경 변수** (`.env`):
```
SNOWFLAKE_ACCOUNT=...
SNOWFLAKE_USER=svc_competitor_radar
SNOWFLAKE_PASSWORD=...
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_ROLE=SVC_COMPETITOR_RADAR_READER   # SELECT 전용
```

**핵심 조회 뷰**: `BCAVE.SEWON.V_PRODUCT_DAILY_SNAPSHOT`
- 컬럼: `sku_code, msrp_price, current_pos_price, total_stock_qty, sales_qty_yesterday, sales_qty_avg_7d`
- 실제 컬럼명은 이슬비·은상이와 확인 후 확정 (04-matching.md 참조)

**SKU 매핑 방식**:
- Phase 2 초기: `products.own_sku` 수동 매핑 테이블 (`own_sku_map`)
- Phase 2 후기: 무신사 자사 상품 페이지 "상품번호" 파싱 자동화

### 3.2 pgvector 임베딩

**임베딩 모델**: BAAI/bge-m3 (1024차원, ADR-006)
**유사도 함수**: cosine similarity (`1 - (embedding <=> comp.embedding)`)
**임계값**: 0.75 이상 (cosine similarity)

**임베딩 파이프라인**:
```
products.name + description + category_path
  → bge-m3 (Ollama에서 embedding 생성)
  → products.embedding (vector(1024)) 저장
```

현재 `products.embedding` 컬럼은 마이그레이션 00002에 정의됨. 임베딩 생성 모듈 (`worker/ingest/embedder.py`)은 Phase 2.1 단계 C에서 신설.

### 3.3 매칭 흐름 요약

```
이상 상품 (anomaly.product_id)
  1. pgvector cosine ≥ 0.75인 자사 상품 후보 Top 5
  2. 카테고리 일치 여부 필터링
  3. 가격대 ±30% 범위 필터
  4. Top N의 own_sku → Snowflake 조회
  5. diff_summary 구성 → product_matches INSERT
```

### 3.4 diff_summary JSON 구조

```json
{
  "price_diff_krw": -5000,
  "price_diff_pct": -8.3,
  "competitor_price": 65000,
  "own_price_msrp": 70000,
  "own_price_pos": 49000,
  "stock_status": "low",       // out/critical/low/normal/overstock
  "stock_qty": 320,
  "sales_yesterday": 12,
  "sales_avg_7d": 18,
  "color_overlap": ["black", "cream"],
  "fit_diff": "competitor:loose vs own:regular"
}
```

---

## 4. LLM 에이전트

> 구현 상세: `docs/skills/05-agent-llm.md`

### 4.1 모델·런타임

| 항목 | 값 |
|---|---|
| 모델 | Qwen 2.5 14B Instruct Q4_K_M |
| 런타임 | Ollama (Docker, GPU 서버 온프렘) |
| API | OpenAI 호환 (`OLLAMA_HOST=http://ollama:11434/v1`) |
| 예상 latency | 8~15초/건 (10GB VRAM 기준) |
| 일 최대 분석 건수 | Top 50 severity → 약 7~12분 |

### 4.2 프롬프트 v1 골격

**시스템 프롬프트**:
```
당신은 한국 패션 브랜드 B.CAVE의 IT팀에 소속된 시장 분석 어시스턴트다.
무신사에서 발견된 경쟁사 상품의 이상 징후와 자사(커버낫 등) 대응 상품 정보를 보고,
실무자가 즉시 활용 가능한 전략 제안을 한국어 JSON으로 출력한다.

원칙:
1. 자사 상품·수치는 입력된 데이터만 사용. 모르는 SKU나 매출은 추측 금지.
2. 가설은 "가설"이라 명시. 단정 금지.
3. 행동 권고: price_match | promo_match | inventory_push | monitor 중 하나.
4. priority: high / medium / low.
5. 출력은 JSON 1개. 코드블록 금지.
```

**출력 스키마 (`strategy_recommendation`)**:
```json
{
  "cause_hypothesis": "원인 가설 1~2문장",
  "impact_on_own": "자사 영향 1~2문장",
  "action": "price_match",
  "action_detail": "구체적 실행 방안 1~2문장",
  "priority": "high",
  "confidence": 0.82
}
```

**유저 프롬프트 구조**:
```
## 경쟁사 상품
브랜드 / 상품명 / 카테고리 / 현재가 / 정상가

## 오늘 탐지된 이상 징후
- rank_surge: 73위 → 18위 (Δ55)
- price_change: 79,000원 → 49,000원 (-38.0%)

## 자사 매칭 상품 (Top 3)
- [SKU] / 유사도 0.91 / 정상가 70,000 / POS가 49,000 / 재고 320 (low) / 7일매출 18개/일

## 요청
위 정보로 JSON 스키마에 맞게 답하라.
```

### 4.3 환각 검증 정책 (ADR-025)

`validators.py`가 출력 텍스트에서 SKU 패턴을 정규식으로 추출 → `own_matches`의 valid SKU 목록과 대조.

```python
# 환각 발견 시
if hallucinated_skus:
    logger.warning(f"Hallucinated SKUs detected: {hallucinated_skus}. Analysis discarded.")
    # → agent_analyses 미저장, 알림 큐 추가
    return None
```

환각 발견 → **분석 결과 폐기** → 해당 anomaly는 `analyzed=false` 유지 → 다음 날 재분석 대상.

---

## 5. 마이그레이션 스케치

### 5.1 00015_anomalies.sql

```sql
create table anomalies (...);  -- 섹션 2.4 참조
-- 인덱스 5개, RLS (anon read), UNIQUE 제약
```

### 5.2 00016_agent_analyses.sql

```sql
create table if not exists agent_analyses (
  id                      uuid primary key default gen_random_uuid(),
  anomaly_id              uuid not null references anomalies(id),
  model_version           text not null,
  prompt_version          text not null,
  llm_reasoning           text,
  strategy_recommendation jsonb,
  tokens_in               int,
  tokens_out              int,
  latency_ms              int,
  created_at              timestamptz not null default now()
);

create table if not exists agent_analyses_feedback (
  id              uuid primary key default gen_random_uuid(),
  analysis_id     uuid not null references agent_analyses(id),
  actor           text not null,   -- Phase 2.0 후 user.email
  verdict         text not null check (verdict in ('accepted','rejected','modified')),
  comment         text,
  created_at      timestamptz not null default now()
);

-- 인덱스
create index agent_analyses_anomaly_idx    on agent_analyses(anomaly_id);
create index agent_analyses_created_at_idx on agent_analyses(created_at desc);
create index agent_analyses_feedback_idx   on agent_analyses_feedback(analysis_id);

-- RLS
alter table agent_analyses enable row level security;
create policy "anon read agent_analyses"
  on agent_analyses for select to anon using (true);

alter table agent_analyses_feedback enable row level security;
create policy "authenticated write feedback"
  on agent_analyses_feedback for insert
  to authenticated with check (auth.uid() is not null);
```

### 5.3 마이그레이션 적용 순서

```
00014_user_roles.sql   (Phase 2.0 단계 A)
00015_anomalies.sql    (Phase 2.1 단계 A)
00016_agent_analyses.sql  (Phase 2.1 단계 A)
```

---

## 6. viewer 작업

### 6.1 /trends (이상탐지 목록)

- 날짜 선택기 + 탐지 타입 필터 + severity 정렬
- 카드형 목록: 상품명·브랜드·탐지 타입·severity 바 차트
- 클릭 → `/anomalies/[id]` 드릴다운 (기존 페이지 실연결)

### 6.2 /matches (자사 매칭 상세)

- 경쟁 상품 ↔ 자사 상품 나란히 비교 카드
- diff_summary 시각화: 가격 차이 바, 재고 상태 칩, 7일 매출 스파크라인
- 재고 부족(critical) 시 강조 색상

### 6.3 /reports/[date] (LLM 분석 결과)

- strategy_recommendation 표시: cause_hypothesis / impact_on_own / action 배지 / priority 배지
- "채택" / "기각" / "수정" 버튼 → `agent_analyses_feedback` Server Action
- 버튼은 Phase 2.0 완료 후 인증 연동 (미인증 시 버튼 비활성)

---

## 7. 발송 모듈

### 7.1 Slack (`worker/publishers/slack.py`)

- Block Kit 포맷
- 이상 상품 요약 + LLM action badge + 무신사 상품 링크
- Webhook URL은 `.env`에서 (`SLACK_WEBHOOK_URL`)
- 채널: `#competitor-radar`

### 7.2 Notion (`worker/publishers/notion.py`)

- Notion API로 일일 리포트 페이지 생성
- 이상 상품 테이블 + LLM 분석 섹션
- 토큰: `.env` (`NOTION_TOKEN`, `NOTION_DATABASE_ID`)

### 7.3 HTML 리포트 (`worker/publishers/html_report.py`)

- Jinja2 템플릿
- 이메일 첨부 또는 static file 저장
- 인라인 CSS (이메일 클라이언트 호환)

---

## 8. 작업 분할 (단계 A~H)

> 세부 사항: `docs/phase-2.1-tasks.md`

| 단계 | 내용 | 선행 조건 |
|---|---|---|
| A | 마이그레이션 00015·00016 | Phase 1 누적 7일 |
| B | worker/detectors/ 6종 + base.py | A |
| C | worker/matchers/ (embedder + snowflake_pull + vector_match + combiner) | A |
| D | GPU 서버 Ollama 셋업 + Qwen 2.5 14B 다운로드 | — (병행 가능) |
| E | worker/agent/ (llm_client + prompts v1 + analyst + validators) | C, D |
| F | viewer /trends·/matches·/reports/[date] 실연결 | A, E |
| G | 발송 모듈 (slack·notion·html_report) | E |
| H | 통합 테스트 (50건 검수 → 프롬프트 튜닝) | 전 단계 |

---

## 9. 검증 게이트 2.1

- [ ] 무인 탐지 7일 연속 정상 (anomalies 매일 1건 이상)
- [ ] pgvector 매칭: 이상 상품 중 자사 유사 상품 발견율 ≥ 60%
- [ ] Snowflake 연결: SKU 조회 실패율 < 5%
- [ ] LLM 분석 JSON 파싱 실패율 < 5%
- [ ] 분석 1건 latency < 15초 (p95)
- [ ] IT팀장 무작위 20건 검수 → "사용 가능" 70% 이상
- [ ] 환각 (존재하지 않는 SKU) 0건

---

## 10. 리스크

| ID | 설명 | 대응 |
|---|---|---|
| R4 | Snowflake V_PRODUCT_DAILY_SNAPSHOT 컬럼명 불일치 | 이슬비·은상이와 스키마 사전 확인. 단계 C 전 완료 필수 |
| R5 | GPU 서버 VRAM 부족 (Qwen 14B 최소 10GB) | 사전 `nvidia-smi` 확인. 부족 시 Qwen 7B Q8 대안 |
| R6 | 환각 발생률 > 5% | 프롬프트 v2 즉시 작성. Few-shot 예시 추가 |
| R7 | review_snapshots 14일 누적 전 review_velocity 미작동 | 첫 2주는 4종만 탐지 (review_velocity·wishlist_surge 제외), 이후 전 6종 활성 |
| R8 | Slack 도배 (다수 이상 상품 동시 발생) | 일별 Top 5 상품만 Slack 발송. 전체는 Notion + viewer에서 확인 |
| R9 | Ollama Docker 컨테이너와 worker 컨테이너 네트워크 격리 | docker-compose.yml에서 같은 network 정의. OLLAMA_HOST 환경 변수로 추상화 |
