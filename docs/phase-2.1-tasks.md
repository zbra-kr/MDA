# Phase 2.1 작업 분할 — 단계 A~H

> 작성: 2026-05-16 / 설계 배경: `docs/phase-2.1-design.md` / ADR: ADR-024, ADR-025

---

## 단계 A — 마이그레이션 00015·00016

**목표**: anomalies + agent_analyses + 피드백 테이블을 DB에 적용.

**선행 조건**: Phase 1 자동화 7일 이상 무인 가동 (product_snapshots 7일 누적).

### 작성 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/00015_anomalies.sql` | anomalies 테이블 + 인덱스 5개 + UNIQUE 제약 + RLS |
| `supabase/migrations/00016_agent_analyses.sql` | agent_analyses + agent_analyses_feedback + 인덱스 + RLS |

### 세부 작업

1. `00015_anomalies.sql`:
   - 컬럼: `id, product_id, snapshot_id, detected_on, anomaly_type, severity, evidence, analyzed, created_at`
   - `anomaly_type` CHECK: `rank_surge | price_change | review_velocity | new_entrant | promo_start | wishlist_surge`
   - `severity` CHECK: `0 ≤ severity ≤ 1`
   - UNIQUE 제약: `(product_id, detected_on, anomaly_type)` — 하루 1건 멱등 보장
   - RLS: anon SELECT 허용 (anon read)
2. `00016_agent_analyses.sql`:
   - `agent_analyses`: `anomaly_id, model_version, prompt_version, llm_reasoning, strategy_recommendation (jsonb), tokens_in, tokens_out, latency_ms, created_at`
   - `agent_analyses_feedback`: `analysis_id, actor, verdict (accepted|rejected|modified), comment, created_at`
   - RLS: `agent_analyses` anon read / `agent_analyses_feedback` authenticated INSERT
3. 각 테이블 마이그레이션 적용 순서 주석 기재 (00014 → 00015 → 00016)
4. 첫 admin 계정 설정 스크립트와 별개로 이 두 마이그레이션은 Phase 2.0 단계 A 이후 독립 적용 가능

### 의사결정 사항

- `evidence` jsonb 구조: 탐지기별 key를 표준화할지 자유 jsonb로 둘지 → **자유 jsonb** (탐지기마다 다른 필드가 필요하므로)
- `analyzed` 필드: boolean vs timestamp → **boolean** 단순화 (분석 시각은 agent_analyses.created_at 참조)

### 검증 시나리오

```sql
-- 테이블 존재 확인
\dt anomalies
\dt agent_analyses
\dt agent_analyses_feedback

-- UNIQUE 제약 동작 확인 (중복 INSERT → 오류 발생해야 함)
insert into anomalies (product_id, detected_on, anomaly_type, severity, evidence)
values ('<uuid>', '2026-05-16', 'rank_surge', 0.8, '{"delta": 55}');
-- 동일 INSERT 재시도 → 중복 오류 확인

-- anon SELECT 가능 확인
select count(*) from anomalies; -- anon 연결에서
```

---

## 단계 B — worker/detectors/ 6종 구현

**목표**: BaseDetector 상속 + 6종 탐지기 + 임계값 상수 모듈 구현.

**선행 조건**: 단계 A (anomalies 테이블 존재).

### 작성 파일

| 파일 | 내용 |
|---|---|
| `worker/detectors/__init__.py` | 패키지 init |
| `worker/detectors/_thresholds.py` | 임계값 상수 8개 |
| `worker/detectors/base.py` | `BaseDetector` 추상 클래스 |
| `worker/detectors/rank_surge.py` | 순위 급등 탐지기 |
| `worker/detectors/price_change.py` | 가격 변동 탐지기 |
| `worker/detectors/review_velocity.py` | 리뷰 속도 탐지기 (14일 평균 필요) |
| `worker/detectors/new_entrant.py` | 신규 진입 탐지기 (Top 100) |
| `worker/detectors/promo_start.py` | 신규 프로모션 탐지기 |
| `worker/detectors/wishlist_surge.py` | 위시리스트 급증 탐지기 |

### 세부 작업

1. `_thresholds.py` — 상수 정의 (설계 문서 섹션 2.2 참조):
   ```python
   RANK_SURGE_MIN_DELTA      = 20
   PRICE_CHANGE_MIN_PCT      = 10.0
   REVIEW_VELOCITY_RATIO     = 3.0
   REVIEW_VELOCITY_MIN_COUNT = 10
   NEW_ENTRANT_TOP_N         = 100
   PROMO_START_TRIGGER       = "new"
   WISHLIST_SURGE_MIN_PCT    = 30.0
   WISHLIST_SURGE_MIN_ABS    = 100
   ```
2. `base.py` — `BaseDetector`:
   - `async def detect(self, date: date) -> list[AnomalyRow]` 추상 메서드
   - `AnomalyRow` dataclass: `product_id, snapshot_id, detected_on, anomaly_type, severity, evidence`
3. 탐지기별 구현 (`docs/skills/03-detection.md` 참조):
   - `rank_surge`: 어제 rank_main − 오늘 rank_main ≥ 20 (상승 = 숫자 감소), severity 공식 적용
   - `price_change`: `abs((today_price - prev_price) / prev_price) * 100 ≥ 10.0`, severity = min(1.0, pct/100 * 1.5)
   - `review_velocity`: 14일 평균 대비 3배 초과 + 절대 10건 이상 — 14일 미만 데이터 시 건너뜀
   - `new_entrant`: 어제 Top 100 없던 상품이 오늘 Top 100 진입, severity = 1/0.7/0.4/0.2 (Top10/30/60/기타)
   - `promo_start`: 어제 없던 promotions 행이 오늘 존재 (`promo_type` 신규)
   - `wishlist_surge`: `(today - prev) / prev * 100 ≥ 30.0` AND `abs_diff ≥ 100`
4. 멱등성 보장: ON CONFLICT (product_id, detected_on, anomaly_type) DO NOTHING
5. 탐지 결과 → `anomalies` INSERT 후 `analyzed=false` 기본값

### 의사결정 사항

- `review_velocity` 14일 미만 데이터: 건너뜀 vs partial 계산 → **건너뜀** (R7 리스크 대응 — 첫 2주는 4종만)
- `promo_start` 정의: "어제 없던 행" vs "할인율 급상승" → **어제 없던 행** (신규 프로모션 기준)
- 탐지 결과 배치 크기: 탐지기별 1회 실행 후 전체 INSERT → **탐지기 완료 후 즉시 INSERT** (오류 격리)

### 검증 시나리오

```bash
# 단위 테스트
cd worker && pytest tests/detectors/ -v

# 특정 날짜로 탐지 실행 (CLI)
python -m worker.main detect --date 2026-05-15

# 결과 확인
select anomaly_type, count(*), avg(severity) from anomalies
where detected_on = '2026-05-15'
group by anomaly_type order by count desc;
```

---

## 단계 C — worker/matchers/ 구현

**목표**: Snowflake SKU 풀 + pgvector 임베딩 매칭 + 결과 combiner 구현.

**선행 조건**: 단계 A (anomalies 존재), Snowflake 읽기 전용 계정 생성 완료.

### 작성 파일

| 파일 | 내용 |
|---|---|
| `worker/matchers/__init__.py` | 패키지 init |
| `worker/matchers/snowflake_pull.py` | Snowflake → own_products 조회 |
| `worker/ingest/embedder.py` | bge-m3 임베딩 생성 + products.embedding 저장 |
| `worker/matchers/vector_match.py` | pgvector cosine 매칭 |
| `worker/matchers/combiner.py` | 매칭 결과 + Snowflake diff → product_matches INSERT |

### 세부 작업

1. `embedder.py`:
   - BAAI/bge-m3 (1024차원) — Ollama embedding API 호출
   - 입력: `products.name + " " + description + " " + category_path`
   - products.embedding 컬럼 UPDATE (마이그레이션 00002에 정의됨)
   - 새 상품 추가 시 자동 임베딩: `ingest/supabase_writer.py` 완료 후 호출
2. `snowflake_pull.py`:
   - 환경 변수: `SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_ROLE`
   - 조회 뷰: `BCAVE.SEWON.V_PRODUCT_DAILY_SNAPSHOT` (실제 컬럼명 이슬비·은상이와 확인 필수)
   - 캐싱: 하루 1회 조회 → 인메모리 dict (sku_code → 행) 유지
   - 읽기 전용 서비스 계정만 사용 (쓰기 절대 금지)
3. `vector_match.py`:
   - 입력: `anomaly.product_id`
   - 자사 상품 (`brands.is_own=true` 제한) 중 cosine ≥ 0.75인 Top 5
   - 카테고리 일치 필터 + 가격대 ±30% 범위 필터
   - pgvector 연산: `1 - (embedding <=> comp.embedding)`
4. `combiner.py`:
   - vector_match Top N × Snowflake SKU → diff_summary JSON 구성 (설계 문서 섹션 3.4 참조)
   - `product_matches` INSERT (ON CONFLICT DO UPDATE — 날짜별 갱신)
   - `stock_status` 분류: `out(0) / critical(≤50) / low(≤200) / normal / overstock(≥1000)`

### 의사결정 사항

- Snowflake 컬럼명 확정: 이슬비·은상이와 단계 C 착수 전 사전 확인 필수 (R4 리스크)
- 임베딩 부트스트랩: 기존 products 전체 임베딩 1회성 배치 실행 필요 — `--mode bootstrap-embeddings` CLI 추가
- 매칭 실패 처리: Snowflake SKU 없는 경우 diff_summary 부분 채움 (재고 필드 null 허용)

### 검증 시나리오

```bash
# Snowflake 연결 확인
python -m worker.main test-snowflake

# 임베딩 부트스트랩 (기존 products 전체)
python -m worker.main bootstrap-embeddings --dry-run
python -m worker.main bootstrap-embeddings

# 단일 anomaly 매칭 테스트
python -m worker.main match --anomaly-id <uuid>

# 매칭 결과 확인
select pm.own_sku, pm.similarity_score, pm.diff_summary
from product_matches pm where pm.anomaly_id = '<uuid>';
```

---

## 단계 D — GPU 서버 Ollama 셋업 + Qwen 2.5 14B 다운로드

**목표**: Ollama Docker 컨테이너 실행 + Qwen 2.5 14B Q4_K_M 모델 사용 가능한 상태.

**선행 조건**: GPU 서버 접근 가능 + VRAM ≥ 10GB 확인.

**병행 가능**: 다른 단계와 독립적으로 진행 가능.

### 세부 작업

1. GPU 서버 사전 확인:
   ```bash
   nvidia-smi  # VRAM 확인 (≥10GB 필요, 부족 시 Qwen 7B Q8 대안)
   docker --version  # Docker 설치 확인
   ```
2. Ollama Docker 컨테이너 설정:
   ```yaml
   # docker-compose.yml 추가 (기존 파일 수정)
   ollama:
     image: ollama/ollama:latest
     volumes:
       - ollama_data:/root/.ollama
     ports:
       - "11434:11434"
     deploy:
       resources:
         reservations:
           devices:
             - driver: nvidia
               count: 1
               capabilities: [gpu]
     networks:
       - radar_net
   ```
3. Qwen 2.5 14B Q4_K_M 다운로드 (약 8.5GB):
   ```bash
   docker exec ollama ollama pull qwen2.5:14b-instruct-q4_K_M
   ```
4. OLLAMA_HOST 환경 변수 추가 (`.env.example`):
   ```
   OLLAMA_HOST=http://ollama:11434/v1
   ```
5. worker 컨테이너와 ollama 컨테이너 같은 network 연결 확인 (`radar_net`)
6. 모델 응답 smoke test:
   ```bash
   curl http://localhost:11434/api/generate \
     -d '{"model":"qwen2.5:14b-instruct-q4_K_M","prompt":"안녕","stream":false}'
   ```

### 의사결정 사항

- VRAM 부족 시 대안: Qwen 2.5 7B Q8 (약 7.8GB) — 품질 저하 감수
- GPU 서버 없을 경우: CPU 전용 실행 가능하나 latency ≥ 120초 예상 → 단계 H에서 허용 기준 재조정

### 검증 시나리오

```bash
# 모델 응답 확인
curl http://ollama:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5:14b-instruct-q4_K_M","messages":[{"role":"user","content":"안녕하세요"}]}'
# → 정상 JSON 응답 + latency ≤ 15초 (VRAM 기준)

# docker-compose 네트워크 확인
docker network inspect radar_net | grep ollama
```

---

## 단계 E — worker/agent/ 구현

**목표**: LLM 클라이언트 + 프롬프트 + 분석 파이프라인 + 환각 검증기 구현.

**선행 조건**: 단계 C (매칭 결과 존재), 단계 D (Ollama 가동 중).

### 작성 파일

| 파일 | 내용 |
|---|---|
| `worker/agent/__init__.py` | 패키지 init |
| `worker/agent/llm_client.py` | Ollama OpenAI-호환 클라이언트 래퍼 |
| `worker/agent/prompts.py` | 시스템 프롬프트 + 유저 프롬프트 빌더 v1 |
| `worker/agent/analyst.py` | anomaly → 매칭 → LLM → agent_analyses INSERT 파이프라인 |
| `worker/agent/validators.py` | 환각 검증 (SKU 정규식 추출 + 유효 목록 대조) |

### 세부 작업

1. `llm_client.py`:
   - `openai` 패키지 사용 (`openai.AsyncOpenAI(base_url=OLLAMA_HOST, api_key="ollama")`)
   - `async def complete(system: str, user: str, model: str) -> str` 인터페이스
   - timeout=60초, retry=1회 (실패 시 None 반환, 로그)
2. `prompts.py`:
   - 시스템 프롬프트: 설계 문서 섹션 4.2 전문 그대로 사용
   - `build_user_prompt(anomalies: list, matches: list) -> str` 함수
   - 출력 스키마 JSON을 프롬프트 마지막에 명시 (`strategy_recommendation`)
3. `analyst.py`:
   - 오늘 날짜 기준 `analyzed=false` anomalies 조회 (severity 내림차순 Top 50)
   - 각 anomaly → 매칭 조회 → 프롬프트 빌드 → LLM 호출 → validators 검증
   - 검증 통과 시 `agent_analyses` INSERT + `anomalies.analyzed = true`
   - 실패(환각) 시 해당 anomaly 건너뜀 (analyzed=false 유지 → 다음 날 재시도)
   - 순차 처리 (동시 LLM 호출 금지 — GPU 메모리 관리)
4. `validators.py` (ADR-025):
   - SKU 패턴 정규식: `product_matches`의 valid own_sku 목록 생성
   - LLM 출력 텍스트에서 SKU 패턴 추출 → 유효 목록과 대조
   - 환각 발견 시 `return None` + `logger.warning`
5. `prompts.py` JSON 파싱 실패 처리:
   - `json.loads(llm_output)` 실패 → 재시도 1회 (hint 추가: "JSON만 출력")
   - 2회 연속 실패 → None 반환

### 의사결정 사항

- 일 최대 분석 건수: Top 50 severity (약 7~12분 소요 예상)
- JSON 파싱 실패 재시도 횟수: 1회 (총 2회 시도 후 포기)
- `tokens_in` / `tokens_out` 기록 방식: OpenAI 호환 응답의 `usage` 필드 사용

### 검증 시나리오

```bash
# 단일 anomaly 분석 테스트 (dry-run)
python -m worker.main analyze --anomaly-id <uuid> --dry-run

# 실제 저장
python -m worker.main analyze --anomaly-id <uuid>

# 결과 확인
select aa.model_version, aa.strategy_recommendation, aa.latency_ms
from agent_analyses aa where aa.anomaly_id = '<uuid>';

# 환각 검증 테스트 (존재하지 않는 SKU 주입)
# validators.py 단위 테스트
cd worker && pytest tests/agent/test_validators.py -v
```

---

## 단계 F — viewer /trends·/matches·/reports/[date] 실연결

**목표**: Phase 2.1 데이터를 viewer에서 실연결 렌더링.

**선행 조건**: 단계 A (테이블 존재), 단계 E (분석 결과 10건 이상 축적).

### 작성·수정 파일

| 파일 | 내용 |
|---|---|
| `viewer/lib/queries.ts` | `getAnomalies()`, `getAnomaly()`, `getProductMatches()`, `getAgentAnalyses()` 추가 |
| `viewer/app/(app)/trends/page.tsx` | 이상탐지 목록 실연결 (플레이스홀더 → 실데이터) |
| `viewer/app/(app)/anomalies/[id]/page.tsx` | 드릴다운 실연결 |
| `viewer/app/(app)/matches/page.tsx` | 자사 매칭 상세 실연결 |
| `viewer/app/(app)/reports/[date]/page.tsx` | LLM 분석 결과 실연결 |
| `viewer/app/(app)/reports/[date]/actions.ts` | `submitFeedback` Server Action |

### 세부 작업

1. `lib/queries.ts` 쿼리 추가:
   - `getAnomalies(date?, type?, limit?)`: anomalies + products 조인, severity 내림차순
   - `getAnomaly(id)`: 단건 + product + brand + agent_analyses
   - `getProductMatches(anomalyId)`: product_matches + own_sku 상세
   - `getAgentAnalyses(date)`: 해당 날짜 분석 목록 + feedback
2. `/trends` 실연결:
   - 날짜 선택기 (searchParams.date, 기본 오늘)
   - 탐지 타입 필터 (searchParams.type)
   - 카드형 목록: severity 바 (0~1 → 너비 %), 탐지 타입 배지
3. `/matches` 실연결:
   - 경쟁 상품 ↔ 자사 매칭 나란히 표시
   - diff_summary: 가격 차이 (+/- 색상), 재고 상태 칩 (out=빨강/critical=주황/low=노랑/normal=초록)
4. `/reports/[date]` 실연결:
   - `strategy_recommendation` 렌더링: cause_hypothesis / impact_on_own / action 배지 / priority 배지
   - 피드백 버튼 ("채택" / "기각" / "수정"): Phase 2.0 완료 전 비활성화 처리
5. `actions.ts` `submitFeedback`:
   - Phase 2.0 인증 미완료 시: `actor = "정호철"` 임시 하드코딩 (단계 F 설계와 동일 방식)
   - `agent_analyses_feedback` INSERT

### 의사결정 사항

- 피드백 버튼 인증 연동 시점: Phase 2.0 단계 F 완료 후 (`user.email`로 전환)
- `/trends` 기본 날짜: 오늘 (최신 탐지 바로 보기)
- severity 시각화: 0~1 → 0~100% 너비 바 (CSS width, Tailwind)

### 검증 시나리오

```
1. /trends?date=2026-05-15 → 해당 날짜 anomalies 카드 렌더 확인
2. 탐지 카드 클릭 → /anomalies/[id] 드릴다운 정상 렌더
3. /matches → product_matches 비교 카드 렌더 확인
4. /reports/2026-05-15 → strategy_recommendation JSON 필드 모두 렌더 확인
5. "채택" 버튼 클릭 → agent_analyses_feedback INSERT 확인 (로컬 DB)
```

---

## 단계 G — 발송 모듈 (slack·notion·html_report)

**목표**: 분석 결과를 Slack·Notion·HTML 리포트로 자동 발송.

**선행 조건**: 단계 E (분석 결과 존재), Slack Webhook + Notion API 토큰 준비.

### 작성 파일

| 파일 | 내용 |
|---|---|
| `worker/publishers/__init__.py` | 패키지 init |
| `worker/publishers/slack.py` | Slack Block Kit 발송 |
| `worker/publishers/notion.py` | Notion 일일 리포트 페이지 생성 |
| `worker/publishers/html_report.py` | Jinja2 HTML 리포트 렌더 + 저장 |
| `worker/publishers/templates/daily_report.html.j2` | HTML 리포트 Jinja2 템플릿 |

### 세부 작업

1. `slack.py`:
   - `SLACK_WEBHOOK_URL` 환경 변수 사용
   - 발송 대상: 오늘 anomalies 중 severity 내림차순 Top 5만 (R8 도배 방지)
   - Block Kit 구성: 헤더 + 이상 상품 섹션 (브랜드명 / 탐지 타입 / severity / action 배지) + 무신사 상품 링크
   - 채널: `#competitor-radar` (Webhook URL에 내장)
2. `notion.py`:
   - `NOTION_TOKEN`, `NOTION_DATABASE_ID` 환경 변수
   - 일일 리포트 페이지 생성 (제목: `경쟁사 이상탐지 YYYY-MM-DD`)
   - 이상 상품 테이블 블록 + LLM 분석 섹션 (strategy_recommendation 텍스트화)
   - 전체 이상 상품 포함 (Top 5 제한 없음 — Notion은 조용한 아카이브)
3. `html_report.py`:
   - Jinja2 템플릿 렌더링
   - 인라인 CSS (이메일 클라이언트 호환)
   - 출력: `worker/data/reports/YYYY-MM-DD.html` 파일 저장
   - (이메일 첨부는 Phase 3 이후 별도 모듈)
4. `cron` 추가: 분석 완료 후 발송 (08시 — 07시 분석 cron 완료 후)
5. `.env.example` 추가 변수:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
   NOTION_TOKEN=secret_...
   NOTION_DATABASE_ID=...
   ```

### 의사결정 사항

- Slack Top 5 기준: severity 내림차순 (동률 시 rank_surge > price_change > 나머지 순서)
- Notion 페이지 중복 방지: 날짜별 제목 검색 후 기존 페이지 있으면 업데이트 vs 새 생성 → **새 생성** (단순, 이력 보존)
- HTML 리포트 이메일 발송: Phase 3 이후 (현재는 파일 저장만)

### 검증 시나리오

```bash
# Slack 발송 테스트 (dry-run)
python -m worker.main publish slack --date 2026-05-15 --dry-run

# 실제 Slack 발송
python -m worker.main publish slack --date 2026-05-15

# Notion 페이지 생성 확인
python -m worker.main publish notion --date 2026-05-15

# HTML 리포트 생성 확인
python -m worker.main publish html --date 2026-05-15
# → worker/data/reports/2026-05-15.html 파일 생성 확인

# Slack 메시지 수신 확인 (#competitor-radar)
# Notion 페이지 생성 확인 (데이터베이스에 새 행 추가)
```

---

## 단계 H — 통합 테스트 + slack_pending 정정 SQL

**목표**: 전 파이프라인 통합 테스트 50건 검수 → 프롬프트 튜닝 + 잔여 부채 정정.

**선행 조건**: 단계 B~G 전 완료.

### 작업 내용

#### H-1. 통합 파이프라인 end-to-end 테스트

```bash
# 단계 순서: 탐지 → 매칭 → 분석 → 발송
python -m worker.main run-pipeline --date 2026-05-15

# 로그 확인
tail -f worker/logs/2026-05-15.jsonl
```

검증 항목:
- anomalies 생성 건수 ≥ 1건/일
- product_matches 매칭률 ≥ 60% (이상 상품 대비)
- agent_analyses JSON 파싱 실패율 < 5%
- Slack 발송 정상 (Top 5)
- Notion 페이지 생성 정상

#### H-2. IT팀장 20건 무작위 검수

- `agent_analyses` 에서 무작위 20건 추출 → `strategy_recommendation` 내용 검토
- 판정 기준: "즉시 활용 가능한가" (YES/NO)
- 목표: 70% 이상 YES

#### H-3. 프롬프트 튜닝 (필요 시)

- 환각 발생 시: 설계 문서 ADR-025 정책 재확인 + SKU 목록 명시 강화
- 부정확한 action 추천: Few-shot 예시 2~3건 추가 (prompts.py 업데이트)
- `prompt_version` 필드 `"v1"` → `"v1.1"` 등으로 버전 관리

#### H-4. slack_pending=4 정정 SQL (잔여 부채)

```sql
-- daily_reports에서 발송 대기 건수가 4로 잘못 고정된 경우 정정
-- (실제 발송 결과와 대조 후 적용)
update daily_reports
set stages = jsonb_set(stages, '{slack_pending}', '0')
where stages->>'slack_pending' = '4'
  and report_date < current_date;
```

적용 전 dry-run 확인 필수:
```sql
select id, report_date, stages->>'slack_pending'
from daily_reports
where stages->>'slack_pending' = '4';
```

#### H-5. 검증 게이트 2.1 최종 확인

| 항목 | 기준 | 통과 |
|---|---|---|
| 무인 탐지 7일 연속 | anomalies ≥ 1건/일 | |
| pgvector 매칭률 | ≥ 60% | |
| Snowflake SKU 실패율 | < 5% | |
| LLM JSON 파싱 실패율 | < 5% | |
| 분석 latency p95 | < 15초 | |
| IT팀장 20건 검수 | ≥ 70% 사용 가능 | |
| 환각 (존재하지 않는 SKU) | 0건 | |

### 의사결정 사항

- 50건 검수 중 환각 3건 이상 발견 시: 단계 E 즉시 복귀 후 validators 강화
- 프롬프트 튜닝 상한: v1 → v3까지 (그 이상은 모델 교체 검토)
- `slack_pending` 정정 SQL 적용 시점: 단계 G 발송 cron 최소 3회 정상 동작 확인 후

### 검증 시나리오

```bash
# 7일 연속 파이프라인 완료 후 최종 확인
select detected_on, count(*) from anomalies
where detected_on >= current_date - 7
group by detected_on order by detected_on;
-- → 7개 날짜 각각 ≥ 1건

select count(*) filter (where strategy_recommendation is not null) * 100.0
     / count(*) as analysis_success_pct
from agent_analyses
where created_at >= now() - interval '7 days';
-- → ≥ 95%
```
