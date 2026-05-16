# Roadmap

본 시스템은 3 Phase, 각 2주, 총 6주 일정으로 빌드한다. 각 Phase 끝에 IT팀장 정호철이 검증 게이트를 통과해야 다음 Phase로 진행.

> **최종 갱신**: 2026-05-16 (Phase 1 본채 완료 + Phase 1.5·1.6 추가)
> **현재 상태**: Phase 1 자동화 가동 중 (cron 3개), 검증 게이트 1 관찰 중

## Phase 1 — 수집·적재 파이프라인 (Week 1~2)

**목표**: 무신사 전 카테고리에서 데이터가 매일 자동으로 Supabase에 쌓이는 상태.

### 작업

- [x] Supabase 프로젝트 생성, pgvector 확장 활성화
- [x] 마이그레이션 SQL 작성 및 적용 (`supabase/migrations/00001_init.sql` ~ `00008_add_thumbnail_url.sql`)
- [x] 시드 데이터 적재 (카테고리 11개 활성 · 자사 브랜드 11개 · 경쟁브랜드 600+개 누적)
- [x] Playwright 베이스 스크래퍼 (`worker/scrapers/base.py`)
  - rate limit, retry, stealth, 로깅
- [x] 카테고리 랭킹 스크래퍼 (`scrapers/musinsa_ranking.py`)
  - 무신사 client API 직접 호출, 11개 카테고리 × 101건 = 일 1,111건 수집
- [x] 상품 상세 스크래퍼 (`scrapers/musinsa_product.py`)
  - Playwright 응답 인터셉트, 8 capture + 5 deny 패턴
  - 18초/상품 평균, 봇 차단 0
- [x] Supabase 적재 모듈 (`ingest/supabase_writer.py`, `ingest/detail_writer.py`)
  - 랭킹 3 테이블 + 상세 5 테이블 멱등 upsert
  - musinsa_brand_id 백필 로직 포함
- [ ] 이벤트 스크래퍼 (`scrapers/musinsa_event.py`) — Phase 2 와 같이 검토
- [ ] 코디·스냅 스크래퍼 (`scrapers/musinsa_snap.py`) — 상품 상세에서 일부 포함됨
- [ ] 리뷰 스크래퍼 (`scrapers/musinsa_review.py`) — 상품 상세에서 ai_summary 만 수집 (본문은 거버넌스로 제외)
- [ ] 이미지 파이프라인 (`ingest/image_pipeline.py`) — thumbnail_url + main_image_url 만 URL 보관, Storage 적재는 Phase 3 으로 보류
- [ ] 임베딩 모듈 (`ingest/embedder.py`) — bge-m3, Phase 2 매칭과 같이
- [x] cron 자동화 (`scripts/run_daily.sh` 22시 · `scripts/run_detail.sh` 01시·05시)
- [ ] **1주일 무인 가동 검증** — 가동 시작 2026-05-15 22:00

### 검증 게이트 1
- [ ] 7일 연속 무인 데이터 수집 성공 — 관찰 중
- [ ] 일평균 신규 product 100건, snapshot 1,111건 수집 — 일평균 충족 예상
- [ ] 상세 일 300건 적재 (01시 150 + 05시 150) — 점진 검증 3개 batch 통과
- [ ] 봇 차단 / IP 블록 발생 없음 — 33개 점진 검증 시점까지 0건
- [ ] 디스크 사용량 모니터링 (Supabase 500MB 한도 추적) — 신규 항목
- [ ] 로그 감사 가능 — logs/ 디렉토리 일자별 분리

## Phase 1.5 — 회사 마스터 (정적) — Week 1~2 (곁가지)

**목표**: 경쟁사 brand 들을 운영 회사 단위로 묶어 경쟁 구도를 회사 차원에서 분석 가능하게.

### 작업
- [x] `companies` 테이블 신설 (`supabase/migrations/00006_companies.sql`)
- [x] 회사 마스터 98개사 시드 (상장 49 + 비상장 49 + 자사 1)
  - DART 2026.04 공시 기준 매출·영업이익·자산 등 정적 데이터
- [x] brands ↔ companies 매핑 (18 → 600+ brand 확장 중 자동 증가)
- [x] 자사 (B.CAVE) brand 정정 — 3개 → 11개 (2026-05-15 새벽 발견)
  - covernat, covernatwoman, covernatkids, covernatbeauty
  - lee, leekids
  - wackywilly (seed 의 'wakywilly' 슬러그 오타 발견, musinsa_brand_id 만 정정)
  - fallett, wrangler, namerclothing, thrasher
- [x] viewer 화면 4개 실연결 (`/reports/today`, `/products/today`, `/companies`, `/brands`)

### 검증 게이트 1.5 (Phase 1 게이트와 같이 통과)
- [x] 비케이브 brand_count = 11
- [x] 자사 brand 모두 is_own=true, is_competitor=false
- [x] v_company_brand_summary 정상 렌더
- [ ] wackywilly slug 정정 (FK 영향 점검 후 별도 작업)

## Phase 1.6 — DART 통합 (회사 마스터 동적 갱신)

**목표**: `companies` 의 정적 재무·공시 데이터를 DART OpenAPI 로 자동 갱신. 회사 마스터를 정적 → 동적 시스템으로 진화.

**선행 조건**: Phase 1 자동화 1주일 무인 가동 안정 확인 후 시작.

### 작업
- [ ] DART 인증키 발급 (정호철 개인 명의) + `OpenDartReader` 설치
- [ ] 98개사 ↔ DART corp_code 매핑표 (반자동 + 사람 검토)
- [ ] 마이그레이션 00009 (`dart_corp_codes` + `company_financials_history` + `disclosures`)
- [ ] 마이그레이션 00010 (`companies` 컬럼 추가 — `latest_*`, `last_disclosure_*`)
- [ ] 재무 fetcher (`worker/dart/financials.py`) + 10년 부트스트랩 (2016~2025, 약 3,920행)
- [ ] 공시 fetcher (`worker/dart/disclosures.py`) + 10년 부트스트랩 (약 19,600행, `notified_to_slack=true` 로 시작)
- [ ] cron 2개 추가 (일요일 06시 공시 · 분기 첫 달 1일 07시 재무)

### Phase 2 통합 항목 (Phase 1.6 완료 후 Phase 2 와 같이)
- [ ] LLM 요약 (`worker/dart/llm_summarizer.py`) — Phase 2 LLM 인프라 공유
- [ ] Slack 알림 (모든 공시 · 자사 제외 · `#competitor-radar`)
- [ ] viewer `/companies/[id]` 시각화 (10년 재무 차트 + 최근 공시 리스트)

### 결정사항 (확정 2026-05-16)
- 인증키: 정호철 개인 명의
- 비상장 매칭 실패: `companies` 정적 보존, 자동 갱신 안 됨
- Slack 알림: 모든 공시 (도배 감수, 자사 제외)
- 재무 부트스트랩: 10년 (2016~2025)
- 자사 공시: viewer 표시 yes · Slack 알림 no

자세한 내용은 `worker/dart/README.md`, `docs/skills/09-dart-integration.md` 참조.

### 검증 게이트 1.6
- [ ] 매핑 성공률 상장 49 ≥ 95%, 전체 ≥ 70개
- [ ] 부트스트랩 1회성 완료 (재무 약 33분 + 공시 약 30분)
- [ ] 분기 cron 1회 정상 동작 (예: 2026-07-01 07시)

## Phase 1.7 — 감사보고서 자동 파싱 (DART API 한계 보완) ✅

**목표**: Phase 1.6 finstate API 응답 없는 회사 45사의 재무를 감사보고서 XML 에서 추출. 자사(비케이브) 포함.

**완료**: 2026-05-16. 부트스트랩 484건 적재, fail=0.

### 배경

Phase 1.6 부트스트랩 후 발견 — DART `finstate` API 는 사업보고서 제출 의무 회사만 응답. 외감 대상이지만 감사보고서만 제출하는 45사 (자사 비케이브 포함) 는 재무 데이터 누락. 자사 재무 없이는 viewer 의미 반감.

### 작업 (완료)
- [x] DART document() API 사전 테스트 → XML 반환 확인, Vision API 계획 폐기 (ADR-022)
- [x] 대상 회사 선정 (단계 B — 45개사 확정)
- [x] 마이그레이션 00011 (`company_financials_history` 에 `data_source`, `audit_extraction_metadata` 컬럼 추가)
- [x] xml_fetcher.py — DART document() → XML str, status:014 처리
- [x] xml_parser.py — XML 파싱 (lxml recover=True, SUMMARY 백만원 + BODY/TE 원→백만원)
- [x] dart_writer.py 확장 — data_source + audit_metadata_list
- [x] main.py CLI — --mode single | bootstrap-audit-financials [--dry-run]
- [x] 전체 45개사 부트스트랩 완료 (484건, fail=0, 소요 6분)

### 결정사항 (확정 2026-05-16)
- 대상 범위: 공시 있는 비상장 전체 (45개사 확정)
- 파싱 방식: XML 단일 파싱 (당초 Vision API → 변경, ADR-022)
- 비용: $0 부트스트랩 (당초 $20~$100 예상에서 절감)
- 작업 시간: 약 3시간 (실측, 당초 5~7시간 예상)

자세한 내용은 `worker/dart/pdf_parsing/README.md`, `docs/skills/10-pdf-parsing.md` 참조.

### 검증 게이트 1.7
- [x] 자사 (비케이브) 6년치 추출 정확도 0~0.3% (메모리 일치)
- [x] 전체 45개사 부트스트랩 완료, 484행 적재
- [x] LLM 비용 $0

## Phase 2 — 탐지·매칭·LLM 분석 (Week 3~4)

**목표**: 이상상품을 사람이 보고 "쓸만한가" 판단 가능한 수준의 LLM 분석.

### 작업

- [ ] 이상탐지 모듈 4종 (`detectors/`)
  - rank_surge, price_change, review_velocity, new_entrant
- [ ] 추가 탐지 2종
  - promo_start, wishlist_surge
- [ ] Snowflake 풀러 (`matchers/snowflake_pull.py`)
- [ ] 벡터 매칭 (`matchers/vector_match.py`)
- [ ] Ollama 컨테이너 + Qwen 2.5 14B 모델 다운로드
- [ ] LLM 클라이언트 (`agent/llm_client.py`)
- [ ] 분석 프롬프트 v1 (`agent/prompts.py`)
- [ ] 분석 파이프라인 (`agent/analyst.py`)
- [ ] 분석 결과 검수 도구 (간이 CLI)
- [ ] 50건 사람 검수 → 프롬프트 튜닝

### 검증 게이트 2
- [ ] 무작위 20건 LLM 분석 → IT팀장이 "사용 가능" 판정 70% 이상
- [ ] 1건 분석 평균 latency < 15초
- [ ] strategy_recommendation JSON 파싱 실패율 < 5%
- [ ] 환각 (존재하지 않는 자사 SKU 언급 등) 발견 시 즉시 수정

## Phase 3 — 발송·뷰어·운영화 (Week 5~6)

**목표**: 사용 부서가 매일 아침 받아보는 운영 시스템.

### 작업

- [ ] HTML 리포트 템플릿 (`publishers/html_report.py`, Jinja2)
- [ ] Slack 발송 모듈 (Block Kit)
- [ ] Notion 발송 모듈
- [x] Next.js 프로젝트 init (`viewer/`) — Claude Design 핸드오프 통합 완료
- [x] Supabase 연결 레이어 (`viewer/lib/supabase/*`, `viewer/lib/queries.ts`)
- [x] 오늘의 리포트 페이지 (`/reports/[date]`)
- [x] 상품/이상징후 드릴다운 페이지 (`/anomalies/[id]`) — 데이터 누적 후 진짜 렌더
- [x] 도메인 컴포넌트 13종 + 디자인 토큰(radar.tokens v0.3) 적용
- [x] viewer 마이그레이션 SQL (`00003_viewer_views.sql`, `00004_viewer_schema_patch.sql`)
- [x] **mock → Supabase 실연결 전환** (`NEXT_PUBLIC_USE_MOCK=false`, `npm run types`)
- [x] **viewer 화면 4개 실연결** (`/reports/today`, `/products/today`, `/companies`, `/brands`)
- [x] **썸네일 fallback** (`main_image_url ?? thumbnail_url ?? product_images[...]`)
- [x] **ThemeToggle hydration 수정** (mounted 가드, suppressHydrationWarning 미사용)
- [ ] **brands.is_competitor 토글 Server Action** — 임시 service_role 우회, Auth+RLS 전환 필요
- [ ] 과거 이력 페이지 + 멀티브랜드 트렌드 차트 (`/trends` — 현재 플레이스홀더)
- [ ] 매칭 큐레이션 페이지 (`/matches` — 현재 플레이스홀더)
- [ ] 분석 채택/기각 Server Action (`agent_analyses_feedback` 쓰기 경로)
- [ ] Supabase Auth + RLS authenticated 전환 — Vercel 배포 전 필수
- [ ] Vercel 배포 + 도메인 연결 (radar.bcave.co.kr)
- [ ] n8n 풀 파이프라인 (스크래핑 → 탐지 → 매칭 → LLM → 발송) — n8n 도입 재검토 (cron 만으로 충분 가능)
- [ ] 운영 매뉴얼 작성 (`docs/RUNBOOK.md` 완성)
- [ ] 사용 부서 온보딩 (상품기획·MD)

> **Claude Design 핸드오프 통합 노트** (2026-05-14)
> Claude Design이 생성한 viewer-handoff 번들을 `viewer/`에 통합 완료.
> - 디자인 토큰 `tokens.css`(radar.tokens v0.3)를 `app/globals.css`에 병합
> - `next build` 9개 라우트 전부 컴파일 검증 완료
> - 환경 특이사항 2건: ① `next/font/google` 대신 CDN @import 사용
>   (사내망 빌드 안정성) ② `lib/supabase/server.ts`는 @supabase/ssr 0.5+
>   getAll/setAll 패턴으로 갱신
> - `components/ui/`는 비어 있음 — shadcn primitive는 셋업 시
>   `npx shadcn add`로 추가 (README 참조)

> **viewer 실연결 통합 노트** (2026-05-15)
> 4개 화면 (`/reports/today`, `/products/today`, `/companies`, `/brands`) 실데이터 렌더 완료.
> - supabase-js 2.105.4 / CLI 2.98.2 버전 동기화 패치
> - 익명 read RLS 정책 적용
> - brands `is_competitor` 토글 Server Action — service_role 임시 우회 (Phase 3.3 Auth 전환 시 정상화 필수)
> - 썸네일 fallback 체인: `main_image_url ?? thumbnail_url ?? product_images[0]?.cdn_url`
> - ThemeToggle hydration 정상화 (mounted 가드)

### 검증 게이트 3
- [ ] 2주 연속 매일 아침 8시 발송 성공
- [ ] 사용 부서 피드백: "주 1회 이상 액션으로 이어진다"
- [ ] 대시보드 평균 로딩 < 2초
- [ ] 운영 인계 가능 (인프라파트가 단독 운영 가능한 상태)

## Phase 4 이후 (Backlog)

- 29CM, W컨셉 등 다른 플랫폼 확장
- 시간대별 가격 변동 추적 (타임딜 정밀 분석)
- 인플루언서 SNS 연동 (Instagram public posts)
- AB 테스트: 가격 매칭 정책 vs 프로모션 정책 효과 비교
- Slack 봇 인터랙티브 (분석 결과에 코멘트 → DB 피드백)
- 자동 가격 추천 (현재는 사람 판단, 추후 추천 → 승인 플로우)
- 월간 집계 테이블 + 트렌드 보고서
- **wackywilly slug 정정** (FK 영향 점검 후 — Phase 1.5 잔여 부채)
- **DART Phase 2 통합** (LLM 요약 + Slack + viewer 시각화 — Phase 1.6 후행)

## 진행 상황 추적

작업 체크박스는 작업 완료 시 IT팀장이 직접 체크. 주 1회 (금요일) AX 위원회 정기 보고 자료에 포함.

### 변경 이력

- 2026-05-14 — 초안 작성, Phase 1·2·3 구조 확정
- 2026-05-15 — Claude Design 핸드오프 통합 노트 추가, viewer 작업 일부 ✅
- 2026-05-16 — **대규모 갱신**:
  - Phase 1 본채 완료 (스크래퍼 2종 + 적재 2종 + cron 3개)
  - Phase 1.5 신설 (회사 마스터, 자사 brand 11개 정정)
  - Phase 1.6 신설·진행 (DART 통합 — 단계 A~E + 부트스트랩 완료, 단계 F 대기)
  - Phase 1.7 신설 (감사보고서 PDF 파싱 — 설계 완료, 1.6 후 진입)
  - Phase 3.2 일부 ✅ (viewer 4개 화면 실연결)
  - 잔여 부채 청소 (musinsa_brand_id 백필, 썸네일, hydration)
  - Phase 4 Backlog 에 wackywilly slug + DART Phase 2 통합 추가
