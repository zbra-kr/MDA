# CLAUDE.md

> 이 파일은 Claude Code가 매 세션 자동으로 읽는다. 프로젝트 규칙·구조·작업 방식을 여기서 파악한다.

## 프로젝트

**B.CAVE Competitor Radar** — 무신사 경쟁브랜드를 매일 수집·분석해 일일 전략 리포트를 자동 생성하는 시스템.

흐름: 수집(Playwright) → 적재(Supabase) → 이상탐지(Python) → 자사 매칭(pgvector + Snowflake) → LLM 분석(Ollama/Qwen) → 발송(Slack·Notion·HTML) + 뷰어(Next.js).

시스템 오너: IT팀장 정호철. 사내 전용 (proprietary).

## 작업 시작 전 반드시 읽을 문서

작업 종류에 따라 해당 문서를 **먼저 읽고** 시작한다. 문서가 컨벤션·스키마·인터페이스의 단일 진실원천(SoT)이다.

| 작업 영역 | 먼저 읽을 문서 |
|---|---|
| 무엇이든 처음이면 | `ARCHITECTURE.md` (전체 그림) |
| DB 스키마 관련 | `DATA_MODEL.md` + `supabase/migrations/*.sql` |
| 스크래퍼 (`worker/scrapers/`) | `docs/skills/01-scraping.md` |
| 적재 (`worker/ingest/`) | `docs/skills/02-ingestion.md` |
| 이상탐지 (`worker/detectors/`) | `docs/skills/03-detection.md` |
| 자사 매칭 (`worker/matchers/`) | `docs/skills/04-matching.md` |
| LLM 에이전트 (`worker/agent/`) | `docs/skills/05-agent-llm.md` |
| 발송 (`worker/publishers/`) | `docs/skills/06-publishing.md` |
| 뷰어 (`viewer/`) | `docs/skills/07-viewer.md` + `viewer/README.md` |
| n8n·Docker | `docs/skills/08-orchestration.md` |
| 거버넌스·법무·권한 | `GOVERNANCE.md` |
| 기술 결정 배경이 궁금하면 | `docs/DECISIONS.md` (ADR) |
| 지금 어디까지 왔는지 | `docs/ROADMAP.md` |

## 디렉토리 구조

```
worker/      Python 워커 — scrapers / ingest / detectors / matchers / agent / publishers
viewer/      Next.js 15 뷰어 — app(App Router) / components / lib
supabase/    마이그레이션 SQL (00001~00004)
n8n/         워크플로우 export
docs/        ROADMAP / RUNBOOK / DECISIONS / skills (모듈별 개발 가이드)
```

## 코딩 규칙

### 공통
- 작업 전 해당 `docs/skills/0X-*.md`를 읽는다. 거기 명세된 인터페이스·스키마를 그대로 따른다.
- 추측하지 않는다. 무신사 DOM 셀렉터, Snowflake 컬럼명 등 외부 의존은 실제 확인 후 코드화한다. 모르면 사용자에게 묻는다.
- 비밀 키(`.env`, service_role, API 키)는 절대 코드·로그·커밋에 넣지 않는다.
- 큰 변경은 먼저 계획을 제시하고 승인받은 뒤 코드를 작성한다.

### worker (Python)
- Python 3.12, 의존성은 `worker/pyproject.toml`.
- 비동기 우선 (`async`/`await`). 스크래퍼는 `BaseScraper` 상속.
- 거버넌스 강제: 스크래핑은 페이지당 최소 3초 딜레이, 동시성 1, User-Agent 명시. `SCRAPE_MIN_DELAY_SEC` 낮추지 말 것.
- 멱등성: 재실행해도 같은 결과. `product_snapshots`는 INSERT only (UPDATE 금지).
- Snowflake는 읽기 전용 서비스 계정만 사용.
- 로깅은 구조화 (loguru/structlog). 비밀 정보 출력 금지.

### viewer (TypeScript / Next.js)
- Next.js 15 App Router, TypeScript strict, Tailwind v3.
- 색상은 전부 `app/globals.css`의 CSS 변수(`radar.tokens v0.3`). 하드코딩 hex 금지.
- 폰트는 Pretendard + JetBrains Mono만. UI에 이모지 금지.
- 데이터 접근은 **반드시 `lib/queries.ts`를 통해서**. 페이지(`app/`)에서 Supabase를 직접 호출하지 않는다 — mock↔실연결 전환을 위해.
- 숫자는 모노폰트 + `tnum`/`lnum`. 랭킹 차트 Y축은 역축(1위가 상단).
- 뷰어는 anon 키만. service_role 키는 워커 전용 — viewer에 절대 넣지 않는다.

### Supabase
- 마이그레이션 적용 순서: `00001 → 00002 → 00004 → 00003`. (00003이 00004의 `daily_reports.stages` 컬럼에 의존)
- 새 마이그레이션은 다음 번호로 추가. 기존 파일 수정 금지 (이미 적용됐을 수 있음).
- 모든 테이블 RLS 활성화. anon은 SELECT만.

## 빌드·검증 명령

```bash
# viewer
cd viewer && npm install && npm run build      # 타입체크 + 빌드
cd viewer && npm run dev                       # localhost:3000

# worker
cd worker && pip install -e .[dev]
cd worker && pytest                            # 테스트
cd worker && ruff check .                      # 린트
```

코드 변경 후에는 해당 영역의 빌드/린트/테스트를 돌려 통과를 확인한다.

## 현재 상태 (v2.1-stage-b)

- 문서·스키마·인프라 골격 완성 (v0.1.0)
- viewer: Claude Design 핸드오프 통합, `next build` 통과, **현재 mock 데이터로 동작** (v0.2.0)
- worker: **Phase 1~2.1 Stage A·B 코드 완성** — scrapers, ingest, dart, enrichment, detectors (6종) 구현됨
- Supabase: **마이그레이션 00001~00019 작성됨** — 실제 적용은 정호철이 SQL Editor 에서 수동 진행
  - 적용 순서 참고: `00001 → 00002 → 00004 → 00003 → 00005 → ... → 00019`
  - (00003 이 00004의 `daily_reports.stages` 컬럼에 의존, 나머지는 번호 순서대로)
- 가동: Phase 1 자동화 검증 게이트 (5/22 예정)
- 다음 단계: Phase 2.1 Stage C — viewer 실데이터 연동 (5/22 이후)

## 작업 우선순위 (ROADMAP Phase 1)

완료된 순서:
1. `worker/scrapers/base.py` — 공통 베이스 (rate limit·retry·stealth)
2. `worker/scrapers/musinsa_ranking.py` — 첫 스크래퍼
3. `worker/ingest/supabase_writer.py` — 적재
4. `worker/dart/` — DART 공시·재무 수집
5. `worker/enrichment/` — 브랜드 메타데이터 LLM 분류
6. `worker/detectors/` — 이상탐지 6종 (rank_surge, price_change, review_velocity, new_entrant, promo_start, wishlist_surge)
7. 이후 `docs/ROADMAP.md` Phase 2+ 체크리스트 순서대로

## 하지 말 것

- 무신사 ToS·robots.txt 위반 (rate limit 우회, 동시성 증가)
- 핵심 ERP/POS 데이터에 쓰기 — AX 위원회 결정상 LLM·에이전트는 읽기만
- 악성코드·우회 스크립트
- 비밀 키 커밋
- `docs/skills/*.md` 안 읽고 추측으로 모듈 작성
