# Architecture

## 1. 시스템 토폴로지

```
[B.CAVE 온프렘 Docker]                       [Supabase 클라우드]
┌─────────────────────────────────┐         ┌──────────────────────┐
│  Playwright Scraper             │         │  Postgres + pgvector │
│  ↓                              │  write  │  ─────────────────   │
│  Detector (Python rules)        │ ──────→ │  brands              │
│  ↓                              │         │  products            │
│  Matcher (embedding + Snowflake)│         │  product_snapshots   │
│  ↓                              │         │  product_images      │
│  Agent (Ollama / Qwen 14B)      │         │  reviews             │
│  ↓                              │         │  promotions          │
│  Publisher (Slack/Notion/HTML)  │         │  product_matches     │
│  ↑                              │         │  anomalies           │
│  n8n (scheduler)                │         │  agent_analyses      │
└─────────────────────────────────┘         │  daily_reports       │
        ↑                                   │  ─────────────────   │
        │ pull (read-only)                  │  Storage (images)    │
[Snowflake B.CAVE DW]                       │  Edge Functions      │
        ↓                                   └──────────────────────┘
  자사 상품마스터·재고·POS                              ↑
                                                       │ read (RLS anon)
                                            ┌──────────────────────┐
                                            │  Next.js on Vercel   │
                                            │  - 대시보드          │
                                            │  - HTML 리포트       │
                                            └──────────────────────┘
                                                       ↓
                                            [Slack / Notion 발송]
```

## 2. 레이어별 책임

### 2.1 수집 레이어 (Scraping)

**책임**: 무신사에서 다음 6종 데이터를 매일 수집.

| 종류 | 갱신 빈도 | 핵심 필드 |
|---|---|---|
| 카테고리 랭킹 | 일 1회 | 카테고리, 순위, 상품ID, 노출가, 할인율 |
| 상품 상세 | 일 1회 (변동 감지 시) | 옵션, 색상, 사이즈, 본문, 이미지 URL |
| 리뷰 메타 | 일 1회 | 누적 리뷰 수, 평점, 최근 리뷰 코멘트 N개 |
| 이벤트·프로모션 | 일 1회 | 세일탭·타임딜·프리오더 상품 리스트 |
| 코디·스냅샷 | 일 1회 | 태그된 상품, 이미지, 좋아요 수 |
| 자사(커버낫) 자체 | 위와 동일 | 위와 동일, brand_id=own |

**기술 결정**: Playwright headless Chromium + stealth 플러그인. 봇 차단 우회 + JS 렌더링 모두 필요.

### 2.2 적재 레이어 (Ingestion)

**책임**:
- 스크래퍼가 만든 raw dict를 Supabase 테이블 스키마로 정규화
- 이미지를 Supabase Storage에 업로드, imagehash로 중복 제거
- 상품 텍스트(이름 + 카테고리 + 본문 요약)를 bge-m3로 임베딩하여 `products.embedding` 컬럼에 저장
- 매일 새 row를 `product_snapshots`에 append (UPDATE 아닌 INSERT)

**Idempotency**: 같은 `(product_id, snapshot_date)` 조합에 UNIQUE constraint → 재실행 안전.

### 2.3 탐지 레이어 (Detection)

**책임**: 전일 대비 변화량을 계산하여 `anomalies` 테이블에 적재.

탐지 규칙 (초기):
- `rank_surge`: 전일 대비 메인 랭킹 20위 이상 상승
- `price_change`: 가격 변동 10% 이상 OR 신규 할인 적용
- `review_velocity`: 일일 신규 리뷰 수가 14일 평균의 3배 초과
- `new_entrant`: Top 100에 처음 등장
- `promo_start`: 세일탭 신규 진입
- `wishlist_surge`: 위시리스트 카운트 30% 이상 증가

severity 점수 (0~1)를 함께 기록하여 LLM이 우선순위 판단에 사용.

### 2.4 매칭 레이어 (Matching)

**책임**: 이상 경쟁상품에 대응하는 자사 상품을 찾는다.

전략 (단계별):
1. **카테고리 매칭** — 같은 musinsa_code 우선
2. **벡터 유사도** — pgvector `<=>` 연산자로 cosine distance < 0.25 후보
3. **가격대 필터** — 자사 정상가 ±30% 범위
4. **Snowflake 조인** — 자사 SKU 매핑 후 재고·POS 가격·전일 매출 조회

결과는 `product_matches`에 저장, `diff_summary` JSONB에 가격차·재고상태·핏 차이 요약.

### 2.5 LLM 에이전트 레이어 (Agent)

**책임**: 탐지+매칭 결과를 보고 자연어 전략 제안 생성.

- **모델**: Qwen 2.5 14B Instruct Q4_K_M (한국어 강함, 9GB VRAM)
- **런타임**: Ollama (OpenAI 호환 API)
- **입력**: 이상상품 1건 + 매칭된 자사 상품 N개 + 컨텍스트(가격·재고·매출)
- **출력**: JSON 구조화된 분석 (1.원인 가설, 2.자사 영향, 3.대응 전략, 4.우선순위)
- **저장**: `agent_analyses.llm_reasoning`(원문) + `strategy_recommendation`(파싱된 JSON)

### 2.6 발송 레이어 (Publishing)

**책임**:
- 매일 아침 8시 `daily_reports` row 1개 생성
- Top N 이상상품 + 분석 결과를 HTML 템플릿으로 렌더
- Slack은 Block Kit 요약 + 상세 링크
- Notion은 전체 분석을 페이지로 생성
- Vercel 뷰어는 Supabase를 직접 읽기 때문에 추가 푸시 불필요

### 2.7 오케스트레이션 (n8n)

매일 새벽 03:00 KST에 다음 시퀀스 실행:
```
03:00 → 스크래핑 시작 (병렬 10 워커, 카테고리별)
04:30 → 적재·임베딩 완료 대기
04:45 → 탐지 모듈 실행
05:00 → 매칭 모듈 + Snowflake 조회
05:30 → LLM 분석 (이상상품 Top 50)
07:00 → HTML 리포트 생성
08:00 → Slack/Notion 발송
```

실패 시 단계별 재시도 3회, 최종 실패는 IT팀 인프라파트 Slack 채널로 알림.

## 3. 데이터 흐름 핵심 규칙

- **불변성**: `product_snapshots`는 INSERT only, 절대 UPDATE 안 함. 시계열 분석을 위해.
- **이미지**: Supabase Storage의 `competitor-images/` 버킷에 `{brand_slug}/{musinsa_no}/{order}.webp`로 저장. CDN URL을 DB에 보관.
- **임베딩 차원**: bge-m3 → 1024차원. `products.embedding vector(1024)`.
- **자사-경쟁 구분**: `brands.is_own = true` 인 brand의 product가 자사. `is_competitor = true` 인 것이 모니터링 대상. 둘 다 true 가능(커버낫=자사이면서 무신사 페이지를 긁는 대상).

## 4. 보안·네트워크

- Supabase Service Key는 워커만 보유 (.env, Docker secret 권장)
- Vercel은 anon key만 사용, RLS 정책으로 읽기만 허용
- Snowflake는 별도 read-only 서비스 계정 발급 (이슬비/은상이에게 요청)
- 무신사 접근은 워커 컨테이너의 outbound 443만 허용

## 5. 확장 시 고려사항

- 카테고리 추가: `categories` 테이블에 row 추가 + 스크래퍼 워크플로우 노드 복제
- 신규 탐지 규칙: `worker/detectors/` 에 파일 추가, `main.py`에서 import
- 다른 플랫폼(29CM 등) 확장: `scrapers/` 하위에 새 디렉토리, 동일 ingestion 인터페이스 준수
