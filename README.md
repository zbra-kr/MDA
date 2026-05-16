# B.CAVE Competitor Radar

> 무신사 경쟁브랜드 모니터링 · 이상징후 탐지 · 자사 비교 · 일일 전략 리포트 자동 생성 시스템

## What it does

매일 새벽, 다음을 자동 수행한다:

1. **수집** — 무신사 전 카테고리에서 경쟁브랜드(+ 자사 커버낫) 상품의 랭킹, 가격, 리뷰, 이벤트, 코디스냅을 조회하여 누적
2. **탐지** — 전일 대비 이상징후(랭킹 급상승, 가격 급변, 리뷰 폭증, 신규 진입) 식별
3. **매칭** — 이상 경쟁상품에 대응되는 자사 상품을 벡터 유사도로 매칭, Snowflake에서 자사 재고·가격·POS 데이터를 끌어와 비교
4. **분석** — 로컬 LLM(Qwen 2.5 14B)이 비교 결과를 보고 전략 제안 작성
5. **발송** — Slack DM, Notion 페이지, HTML 리포트로 매일 아침 전달

## Stack at a glance

| Layer | Tech |
|---|---|
| 스크래핑 | Playwright (Python) + stealth |
| LLM | Ollama + Qwen 2.5 14B Q4_K_M (로컬) |
| 임베딩 | bge-m3 (다국어) |
| DB | Supabase Postgres + pgvector |
| Storage | Supabase Storage (이미지) |
| 자사 데이터 | Snowflake (B.CAVE 기존 DW) |
| 오케스트레이션 | n8n |
| 뷰어 | Next.js 15 (Vercel) |
| 발송 | Slack Webhook, Notion API |
| 배포 | 워커는 B.CAVE 온프렘 Docker, 뷰어는 Vercel |

## Repository layout

```
bcave-competitor-radar/
├── README.md
├── ARCHITECTURE.md         시스템 전체 그림
├── DATA_MODEL.md           Supabase 스키마 상세
├── GOVERNANCE.md           법무·운영·거버넌스
├── docs/
│   ├── ROADMAP.md          Phase별 작업 목록
│   ├── RUNBOOK.md          운영 매뉴얼
│   ├── DECISIONS.md        ADR
│   └── skills/             모듈별 상세 개발 가이드
│       ├── 01-scraping.md
│       ├── 02-ingestion.md
│       ├── 03-detection.md
│       ├── 04-matching.md
│       ├── 05-agent-llm.md
│       ├── 06-publishing.md
│       ├── 07-viewer.md
│       └── 08-orchestration.md
├── worker/                 Python 워커 (스크래핑·분석·발송)
├── viewer/                 Next.js 15 뷰어 (Claude Design 핸드오프 통합 완료)
│   ├── app/(app)/          대시보드·이상상세 라우트
│   ├── components/radar/   도메인 컴포넌트 13종
│   ├── lib/                queries(mock↔Supabase 전환 레이어)·format·severity
│   └── lib/mock-data.ts    Supabase 연결 전 화면 확인용 더미 데이터
├── n8n/workflows/          n8n 워크플로우 export
├── supabase/migrations/    DB 마이그레이션 SQL (00001~00004)
└── docker-compose.yml      온프렘 워커 스택
```

## Quick start (개발자용)

```bash
# 1. clone
git clone <repo> && cd bcave-competitor-radar

# 2. env
cp .env.example .env
# .env 채우기: SUPABASE_URL, SUPABASE_SERVICE_KEY, SNOWFLAKE_*, SLACK_WEBHOOK, NOTION_TOKEN

# 3. Supabase 스키마 적용 — 순서 주의
#    00001 → 00002 → 00004 → 00003 순으로 적용한다.
#    (00003의 v_pipeline_today가 00004의 daily_reports.stages 컬럼에 의존)
supabase db push   # 또는 migrations SQL을 Supabase SQL Editor에 붙여넣기

# 4. 로컬 스택 기동 (Ollama + n8n + worker)
docker compose up -d

# 5. 모델 다운로드 (최초 1회, 약 9GB)
docker compose exec ollama ollama pull qwen2.5:14b-instruct-q4_K_M
docker compose exec ollama ollama pull bge-m3

# 6. 1회 수동 실행 (검증용)
docker compose exec worker python -m worker.main --task scrape:ranking --category 001
```

### 뷰어 실행 (Next.js)

```bash
cd viewer
cp .env.example .env.local
# NEXT_PUBLIC_USE_MOCK=true 면 Supabase 없이 더미 데이터로 바로 확인 가능
npm install
npx shadcn@latest add button input dialog tabs tooltip   # shadcn primitive 추가
npm run dev    # localhost:3000 → /reports/today 로 리다이렉트

# Supabase 실연결로 전환:
#   .env.local 에 NEXT_PUBLIC_USE_MOCK=false + URL/ANON_KEY 채우고
#   npm run types  (supabase gen types → lib/supabase/types.ts 교체)
```

## 문서 읽는 순서

처음이라면:
1. `ARCHITECTURE.md` — 큰 그림
2. `DATA_MODEL.md` — 데이터 흐름
3. `docs/ROADMAP.md` — 지금 어디까지 왔는지
4. `docs/skills/01-scraping.md` — 첫 번째 모듈

개발에 합류한다면 본인이 맡을 모듈의 `docs/skills/0X-*.md`를 먼저 읽고 그대로 따라 짠다.
