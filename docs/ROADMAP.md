# Roadmap

본 시스템은 3 Phase, 각 2주, 총 6주 일정으로 빌드한다. 각 Phase 끝에 IT팀장 정호철이 검증 게이트를 통과해야 다음 Phase로 진행.

## Phase 1 — 수집·적재 파이프라인 (Week 1~2)

**목표**: 무신사 전 카테고리에서 데이터가 매일 자동으로 Supabase에 쌓이는 상태.

### 작업

- [ ] Supabase 프로젝트 생성, pgvector 확장 활성화
- [ ] 마이그레이션 SQL 작성 및 적용 (`supabase/migrations/00001_init.sql`)
- [ ] 시드 데이터 적재 (카테고리·자사 브랜드·초기 경쟁브랜드 30개)
- [ ] `docker-compose.yml` 작성 (worker + ollama + n8n)
- [ ] Playwright 베이스 스크래퍼 (`worker/scrapers/base.py`)
  - rate limit, retry, stealth, 로깅
- [ ] 카테고리 랭킹 스크래퍼 (`scrapers/musinsa_ranking.py`)
- [ ] 상품 상세 스크래퍼 (`scrapers/musinsa_product.py`)
- [ ] 이벤트 스크래퍼 (`scrapers/musinsa_event.py`)
- [ ] 코디·스냅 스크래퍼 (`scrapers/musinsa_snap.py`)
- [ ] 리뷰 스크래퍼 (`scrapers/musinsa_review.py`)
- [ ] Supabase 적재 모듈 (`ingest/supabase_writer.py`)
- [ ] 이미지 파이프라인 (`ingest/image_pipeline.py`)
- [ ] 임베딩 모듈 (`ingest/embedder.py`) — bge-m3
- [ ] n8n 워크플로우: 스케줄 + 스크래퍼 호출
- [ ] 1주일 무인 가동 검증

### 검증 게이트 1
- [ ] 7일 연속 무인 데이터 수집 성공
- [ ] 일평균 신규 product 100건, snapshot 10,000건+ 수집
- [ ] 이미지 Supabase Storage 적재 정상
- [ ] 봇 차단 / IP 블록 발생 없음
- [ ] 로그 감사 가능

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
- [x] 상품/이상징후 드릴다운 페이지 (`/anomalies/[id]`)
- [x] 도메인 컴포넌트 13종 + 디자인 토큰(radar.tokens v0.3) 적용
- [x] viewer 마이그레이션 SQL (`00003_viewer_views.sql`, `00004_viewer_schema_patch.sql`)
- [ ] mock → Supabase 실연결 전환 (`NEXT_PUBLIC_USE_MOCK=false`, `npm run types`)
- [ ] 과거 이력 페이지 + 멀티브랜드 트렌드 차트 (`/trends` — 현재 플레이스홀더)
- [ ] 매칭 큐레이션 페이지 (`/matches` — 현재 플레이스홀더)
- [ ] 분석 채택/기각 Server Action (`agent_analyses_feedback` 쓰기 경로)
- [ ] Vercel 배포 + 도메인 연결 (radar.bcave.co.kr)
- [ ] n8n 풀 파이프라인 (스크래핑 → 탐지 → 매칭 → LLM → 발송)
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

## 진행 상황 추적

작업 체크박스는 작업 완료 시 IT팀장이 직접 체크. 주 1회 (금요일) AX 위원회 정기 보고 자료에 포함.
