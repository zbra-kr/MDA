# 09. DART 통합 — 회사 마스터 동적 갱신

> **Phase 1.6** · `worker/dart/` 모듈의 작업 가이드.
> 본 문서는 `docs/skills/01-scraping.md` ~ `08-*.md` 와 같은 시리즈. Claude Code 가 본 모듈 작업 시 진입점 문서.

## 0. 본 작업의 위치

- **선행**: Phase 1 무신사 자동화 1주일 안정 가동 + Phase 1.5 회사 마스터 시드 적용 완료
- **후행**: Phase 2 (이상탐지·LLM) — LLM 인프라 공유 시점
- **선행 문서**: `worker/dart/README.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`

본 작업의 범위:
- DART OpenAPI 로 98개사의 재무·공시 자동 수집
- 회사 마스터를 정적 → 동적으로 진화
- Phase 2 와 통합 시 LLM 요약 + Slack 알림 + viewer 시각화

---

## 1. 의도와 목표

### 1.1 왜 만드는가

현재 `companies` 테이블은 2026.04 시점 정적 스냅샷. 분기 지나면 정보 오래됨. 그리고 경쟁사 공시 (경영 변경·인수합병·대규모 계약·자본 변동·지분 변동) 는 무신사 데이터로 안 잡히는 시그널이다.

무신사 = 행동 시그널 (랭킹·가격·위시) + DART = 재무·구조 시그널. 두 차원 결합이 본 시스템의 가치.

### 1.2 본 작업의 산출물

- 새 테이블 3개: `dart_corp_codes`, `company_financials_history`, `disclosures`
- `companies` 컬럼 확장 (최신값 캐시)
- `worker/dart/` 모듈 (financials, disclosures, main, etc.)
- `worker/ingest/dart_writer.py` (기존 ingest/ 패키지에 추가)
- cron 2개 추가 (주간 공시 폴링 + 분기 재무 갱신)

---

## 2. 데이터 모델

### 2.1 새 테이블 3개

#### `dart_corp_codes` — 98개사 ↔ DART 매핑

```sql
create table dart_corp_codes (
  company_id uuid references companies(id) primary key,
  corp_code text not null unique,           -- DART 8자리 고유번호
  corp_name text not null,                  -- DART 등록명
  stock_code text,                          -- 상장사 종목코드 (6자리)
  corp_cls text,                            -- Y(유가증권) / K(코스닥) / N(코넥스) / E(기타비상장)
  ceo_name text,
  business_number text,                     -- 사업자등록번호 (매핑 검증용)
  last_synced_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

create index dart_corp_codes_stock_idx on dart_corp_codes(stock_code) where stock_code is not null;
create index dart_corp_codes_cls_idx on dart_corp_codes(corp_cls);
```

**정책**: 매칭 안 된 회사는 본 테이블에 행 없음. `companies LEFT JOIN dart_corp_codes` 로 매칭 여부 확인. `companies` 자체는 보존.

#### `company_financials_history` — 재무 시계열

```sql
create table company_financials_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) not null,
  fiscal_year int not null,
  fiscal_quarter int,                       -- 1~4 (NULL=연간)
  report_type text not null,                -- 'annual' | 'half' | 'q1' | 'q3'

  -- 손익계산서
  revenue_mkrw bigint,
  operating_income_mkrw bigint,
  net_income_mkrw bigint,

  -- 재무상태표
  total_assets_mkrw bigint,
  total_liabilities_mkrw bigint,
  total_equity_mkrw bigint,

  -- 메타
  is_consolidated boolean default true,
  reporting_currency text default 'KRW',
  source_disclosure_id uuid,                -- disclosures.id FK
  fetched_at timestamptz default now(),

  unique (company_id, fiscal_year, fiscal_quarter, is_consolidated)
);

create index cfh_company_period_idx on company_financials_history(company_id, fiscal_year desc, fiscal_quarter desc nulls first);
create index cfh_year_idx on company_financials_history(fiscal_year);
```

**부트스트랩**: 2016~2025 10년치. 98개사 × 최대 40행 = 약 3,920행.

#### `disclosures` — 공시 메타

```sql
create table disclosures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) not null,

  -- DART 메타
  rcept_no text not null unique,            -- DART 공시 접수번호
  report_nm text not null,
  flr_nm text,
  rcept_dt date not null,
  rm text,                                  -- 정정·첨부 비고

  -- 분류
  disclosure_type text not null,            -- 'A:정기' | 'B:주요사항' | 'D:지분'
  disclosure_subtype text,

  -- 본문·LLM (Phase 2)
  dart_url text not null,
  raw_summary text,
  llm_summary text,
  llm_severity text,                        -- 'high' | 'medium' | 'low'
  llm_processed_at timestamptz,

  -- 알림
  notified_to_slack boolean default false,
  fetched_at timestamptz default now()
);

create index disclosures_company_dt_idx on disclosures(company_id, rcept_dt desc);
create index disclosures_type_dt_idx on disclosures(disclosure_type, rcept_dt desc);
create index disclosures_pending_llm_idx on disclosures(llm_processed_at) where llm_processed_at is null;
create index disclosures_pending_slack_idx on disclosures(notified_to_slack) where notified_to_slack = false;
```

### 2.2 `companies` 컬럼 추가 (00010)

```sql
alter table companies
  add column if not exists latest_fiscal_year int,
  add column if not exists latest_fiscal_quarter int,
  add column if not exists latest_revenue_mkrw bigint,
  add column if not exists latest_operating_income_mkrw bigint,
  add column if not exists latest_financials_synced_at timestamptz,
  add column if not exists last_disclosure_date date,
  add column if not exists last_disclosure_rcept_no text;
```

viewer 가 매번 history 조인 안 하고 `companies` SELECT 한 번으로 최신값. `dart_writer` 가 history INSERT 후 companies UPDATE.

### 2.3 마이그레이션 순서

기존: 00001 → 00002 → 00004 → 00003 → 00005 → 00006 → 00007 → 00008
신규: **00009** (dart 테이블 3개) → **00010** (companies 컬럼)

00009 적용 전에 `companies` 테이블 존재 확인 (00006 의존성). 00010 은 00009 와 독립적이라 순서 무관하지만 번호로 묶어둠.

---

## 3. 작업 단계 (A ~ I)

각 단계 끝에 검증 후 다음. 검증 안 통과하면 다음 단계 진입 금지.

### 단계 A: 사전 준비

- [ ] DART OpenAPI 인증키 발급 (https://opendart.fss.or.kr — 무료, 5분) — **정호철 개인 명의**
- [ ] `pip install opendartreader` (또는 pyproject.toml 에 추가)
- [ ] `.env` 에 `DART_API_KEY=` 추가
- [ ] 검증: `python -c "import OpenDartReader; dart = OpenDartReader('KEY'); print(dart.list(start='2026-05-01', end='2026-05-01', kind='A').head())"` 정상 동작

### 단계 B: 매핑표 만들기 (반자동)

- [ ] `worker/dart/corp_mapping.py` 작성
  - `build_mapping(api_key) -> List[CorpMapping]` — companies 98행 SELECT + 각 회사명 검색
  - 결과: `(company_id, name, dart_corp_code, dart_corp_name, business_number, confidence)`
- [ ] `scripts/build_dart_mapping.py` 실행 → CSV 출력 (`/tmp/dart_mapping.csv`)
- [ ] **사람 검토 단계** — 정호철이 CSV 검토:
  - 자동 매칭 (`confidence=high`): 회사명 + 사업자번호 일치 → 그대로 적용
  - 의심 (`confidence=medium`): 동명 이회사 가능성 → DART 사이트 확인
  - 실패 (`confidence=none`): 비상장·영세 → corp_code NULL 로 둠 (정책: 정적 보존)
- [ ] 검증된 CSV → `supabase/seed_dart_corp_codes.sql` 생성
- [ ] Supabase 적용 + 검증 SQL:

```sql
-- 매칭 성공률
select 
  count(*) as total_companies,
  count(d.company_id) as mapped,
  count(*) filter (where c.listing_type = 'listed') as listed_total,
  count(d.company_id) filter (where c.listing_type = 'listed') as listed_mapped
from companies c
left join dart_corp_codes d on d.company_id = c.id;
-- 기대: listed_mapped / listed_total ≥ 95% (49개 상장 중 47개+)
--       전체 mapped ≥ 70개 (98개 중 70개+)
```

### 단계 C: 마이그레이션 적용

- [ ] `supabase/migrations/00009_dart_tables.sql` 생성 (§2.1 의 3개 테이블 + 인덱스)
- [ ] `supabase/migrations/00010_companies_dart_cols.sql` 생성 (§2.2 의 컬럼 추가)
- [ ] Supabase 적용 + 검증:

```sql
-- 1. 새 테이블 3개
select table_name from information_schema.tables
where table_schema='public' and table_name in 
  ('dart_corp_codes', 'company_financials_history', 'disclosures');

-- 2. companies 컬럼 7개
select column_name from information_schema.columns
where table_name='companies' and column_name like 'latest_%' or column_name like 'last_disclosure_%';
-- 기대: 7행
```

### 단계 D: 재무 fetcher + 10년 부트스트랩

- [ ] `worker/dart/financials.py` 작성
  - `fetch_company_financials(corp_code, year, report_type) -> CompanyFinancials | None`
  - DART report_type 매핑: '11011' (사업/연간), '11012' (반기), '11013' (Q1), '11014' (Q3)
  - 응답 파싱: `OpenDartReader.finstate()` 의 DataFrame → CompanyFinancials 모델 (Pydantic)
  - 실패 시 None 반환 (그 회사·분기 데이터 없음 — 비상장 등)
- [ ] `worker/ingest/dart_writer.py` 작성 (또는 기존 supabase_writer.py 확장)
  - `upsert_financials(financials: CompanyFinancials)` — history INSERT + companies UPDATE
  - 멱등성: ON CONFLICT (company_id, fiscal_year, fiscal_quarter, is_consolidated) DO UPDATE
  - history 최신 행 검출 후 companies.latest_* 컬럼 갱신
- [ ] **부트스트랩 실행**: `python -m worker.dart.main --mode bootstrap-financials --years 2016-2025`
  - 약 33분 소요 (DART rate limit 포함)
  - API 한도 일 1만 건 대비 여유 (3,920건 사용)
- [ ] 검증:

```sql
-- 부트스트랩 결과
select 
  count(*) as total_rows,
  count(distinct company_id) as companies_with_financials,
  count(*) filter (where revenue_mkrw is not null) as with_revenue,
  min(fiscal_year) as oldest, max(fiscal_year) as latest
from company_financials_history;
-- 기대: total_rows 2,000~3,920, companies 49~70, oldest=2016, latest=2025
```

### 단계 E: 공시 fetcher + 10년 부트스트랩

- [ ] `worker/dart/disclosures.py` 작성
  - `fetch_disclosures(corp_code, start_date, end_date) -> List[Disclosure]`
  - 필터: `kind in ('A','B','D')` — 정기·주요사항·지분
  - DART 응답 → Disclosure 모델
- [ ] `dart_writer.py` 에 `upsert_disclosures(disclosures: list[Disclosure])` 추가
  - ON CONFLICT (rcept_no) DO NOTHING (멱등성)
  - **부트스트랩 모드**: `notified_to_slack=true` 로 시작 (폭증 방지)
  - **정상 모드**: `notified_to_slack=false` (Slack 발송 대기)
- [ ] **부트스트랩 실행**: `python -m worker.dart.main --mode bootstrap-disclosures --years 2016-2025 --skip-notify`
  - 약 30분 소요
  - 최대 약 19,600행 (98사 × 10년 × 평균 20건/년)
- [ ] 검증:

```sql
-- 부트스트랩 결과
select 
  disclosure_type,
  count(*) as count
from disclosures
group by disclosure_type
order by disclosure_type;
-- 기대: A 약 4,000건 (10년 × 98사 × 분기 4) / B 약 10,000건 / D 약 5,000건

-- 자사 (비케이브) 공시 정상 들어왔는지
select count(*) from disclosures d
join companies c on c.id = d.company_id
where c.is_own = true;
-- 기대: 0 초과 (비케이브가 외감대상이라면)
```

### 단계 F: 메인 + cron 등록

- [ ] `worker/dart/main.py` 작성
  - CLI: `--mode {bootstrap-financials|bootstrap-disclosures|weekly-disclosures|quarterly-financials}`
  - 로깅 컨벤션은 기존 worker/main.py 와 동일 (loguru)
  - exit code: 0 (정상), 1 (개별 실패), 2 (전체 중단)
- [ ] `scripts/run_dart.sh` 작성 (run_daily.sh, run_detail.sh 와 동일 패턴)
  - 인자: `$1` = mode (weekly-disclosures | quarterly-financials)
  - 로그: `logs/dart_$(date +%Y%m%d)_$1.log`
- [ ] crontab 추가:

```
# Phase 1.6 — DART 자동 갱신
0 6 * * 0       /Users/macmini/projects/MDA/scripts/run_dart.sh weekly-disclosures
0 7 1 1,4,7,10 *  /Users/macmini/projects/MDA/scripts/run_dart.sh quarterly-financials
```

- [ ] 검증: 첫 일요일 cron 실행 후 로그 확인 (`logs/dart_*.log`), disclosures 신규 행 있는지

---

### Phase 2 단계 (G ~ I)

**선행 조건**: Phase 2 (이상탐지·LLM) 와 같은 시점. LLM 인프라 공유.

### 단계 G: LLM 요약

- [ ] `worker/dart/llm_summarizer.py`
  - 매 실행: `disclosures WHERE llm_processed_at IS NULL LIMIT 50`
  - Claude API (Anthropic) 호출 — 본인 API 키
  - 프롬프트 템플릿 (요약 3줄 + severity 평가):
    ```
    당신은 한국 패션 산업 경쟁사 모니터링 분석가입니다.
    다음 DART 공시를 3줄로 요약하고, 경쟁사 모니터링 관점에서 중요도를 평가하세요.
    
    공시: {report_nm} / {flr_nm} / {rcept_dt}
    DART 링크: {dart_url}
    
    출력 JSON:
    {
      "summary": "3줄 이내 한국어 요약",
      "severity": "high|medium|low"
    }
    ```
  - 응답 파싱 후 disclosures UPDATE
- [ ] cron 추가: 매일 02시 (디테일 cron 끝난 후) 또는 별도 시간
- [ ] 비용 관리: 일 50건 상한 (Anthropic API 비용 모니터링)

### 단계 H: Slack 알림

- [ ] **현재 이행계획의 Phase 0.2.4 Slack 채널 설정 필요** (선행)
  - `#competitor-radar` 채널 생성 + Incoming Webhook
  - `.env` 에 `SLACK_WEBHOOK_RADAR=` 추가
- [ ] `worker/dart/slack_notifier.py`
  - `notified_to_slack=false AND company_id NOT IN (자사)` 조회
  - **모든 공시 알림** (Q3 결정): high·medium·low 다 발송 (정호철 도배 감수)
  - Slack Block Kit 메시지:
    - 회사명, 공시명, severity 색상
    - LLM 요약 (있으면)
    - DART 링크
  - 발송 후 notified_to_slack=true UPDATE
- [ ] cron: LLM 요약 cron 직후
- [ ] **운영 후 임계값 조정 가능성**: 며칠 운영해보고 도배 견딜 수 없으면 `WHERE llm_severity = 'high'` 추가

### 단계 I: viewer `/companies/[id]` 시각화

- [ ] `viewer/app/(app)/companies/[id]/page.tsx` 신규
  - Server Component
  - 회사 기본 정보 + 재무 시계열 차트 + 최근 공시 리스트
- [ ] `viewer/lib/queries.ts` 에 추가:
  - `getCompanyDetail(id) -> CompanyDetail`
  - `getCompanyFinancials(id, years) -> Financials[]`
  - `getCompanyDisclosures(id, limit) -> Disclosure[]`
- [ ] `viewer/components/radar/financial-chart.tsx`
  - recharts (이미 의존성 있음)
  - 10년 매출·영업이익·영업이익률 라인 차트
- [ ] `viewer/components/radar/disclosure-list.tsx`
  - 최근 N건 (기본 20)
  - severity 색상 배지
  - LLM 요약 1~2줄 표시 + DART 링크
- [ ] `/companies` 페이지의 행 클릭 → `/companies/[id]` 진입
- [ ] 자사 (비케이브) 도 정상 표시 (Q5 결정)
- [ ] 검증: `npm run build` 통과, localhost 에서 한 회사 진입 → 차트·공시 렌더

---

## 4. 결정사항 (확정 — 2026-05-16 정호철)

| # | 결정 | 답 | 영향 |
|---|---|---|---|
| Q1 | DART 인증키 발급 주체 | 개인 (정호철) | 본인 명의로 발급, 회사 자산 분리 |
| Q2 | 비상장 매칭 실패 회사 처리 | (a) 정적 보존 | companies 행 유지, dart_corp_codes 행 없음 |
| Q3 | 공시 Slack 알림 임계값 | 모든 공시 알림 | 일 평균 16건, 분기말 50건+. 자사 제외. 도배 감수 |
| Q4 | 재무 부트스트랩 기간 | 10년 (2016~2025) | 1회성 약 33분, 약 3,920행 |
| Q5 | 자사 (비케이브) 공시 처리 | viewer yes / Slack no | 정호철 본인 알고 있는 정보 알림 방지 |

본 결정들은 `docs/DECISIONS.md` 에 ADR 형식으로 추가:
- ADR-010: DART 인증키 개인 명의
- ADR-011: 비상장 매칭 실패 정적 보존 정책
- ADR-012: Slack 알림 도배 감수 + 자사 제외
- ADR-013: 재무 부트스트랩 10년
- ADR-014: 자사 공시 viewer 표시·Slack 무시

---

## 5. 위험·고려사항

### 5.1 매칭 정확도
동명 이회사 함정 (특히 그룹 계열사). 예: "이랜드" → 이랜드월드·이랜드리테일·이랜드파크.
**반드시 사람 검토 단계 필수** (단계 B). 사업자번호 대조 권장.

### 5.2 비상장 한계
외감대상 (자산 100억+) 비상장만 DART 공시. 영세 비상장 패션 brand 는 데이터 없음.
Q2 정책 (a) 적용 — 정적 보존, 자동 갱신만 안 됨.

### 5.3 부트스트랩 시 Slack 알림 폭증
부트스트랩으로 INSERT 되는 약 19,600건 공시를 그대로 알림 발송하면 Slack 도배. 
**필수 정책**: 부트스트랩 모드 = `notified_to_slack=true` 로 시작. 정상 cron 부터 알림 활성화.

### 5.4 정정·취하 공시
같은 사안에 원공시 + 정정공시 + 첨부 등 여러 rcept_no 발생.
**정책**: 모두 별도 행 저장. viewer 에서 latest 만 표시 (정정·첨부는 토글). Slack 은 정정공시도 발송 (Q3 모든 공시).

### 5.5 LLM 비용
부트스트랩 19,600건 × LLM 요약 = 비용 폭증. 
**정책**: 부트스트랩 분은 LLM 안 돌림 (`llm_processed_at=NULL` 유지). 신규 공시만 LLM 처리. Phase 2 G 단계에서 부트스트랩 분 백필은 별도 결정.

### 5.6 자사 공시 누락 방지
Q5 정책으로 자사 공시는 Slack 안 보냄. 단 viewer 에는 표시.
slack_notifier 의 SQL에서 `WHERE c.is_own = false` 필터 명시. **자사 회사 ID 하드코딩 안 함** — companies.is_own 컬럼 기준.

---

## 6. 소요 시간

| 단계 | 작업 | 시간 |
|---|---|---|
| A | DART 인증키 + 라이브러리 | 30분 |
| B | 매핑표 빌드·검토 | 2~3시간 (사람 검토) |
| C | 마이그레이션 | 1시간 |
| D | 재무 fetcher + 부트스트랩 | 3시간 + 33분 실행 |
| E | 공시 fetcher + 부트스트랩 | 2시간 + 30분 실행 |
| F | 메인·cron | 1시간 |
| **Phase 1.6 합계** | | **약 11시간** |
| G | LLM 요약 | 4시간 |
| H | Slack 알림 | 2시간 (Slack 채널 셋업 별도) |
| I | viewer 시각화 | 6시간 |
| **Phase 2 통합 합계** | | **약 12시간** |

---

## 7. Claude Code 작업 시 주의

본 모듈 작업 시 다음 패턴 엄수 (마이그레이션 SQL 버그 4건, 추측 어긋남 등 경험):

1. **추측 금지** — DART API 응답 구조는 OpenDartReader 라이브러리 + DART 공식 문서로 검증된 사실만
2. **검증 결과 정확한 숫자로** — "verified" 같은 흐릿한 표현 금지
3. **단계별 검증 후 다음** — 단계 D 통과 후만 E 진입
4. **마이그레이션 적용 vs 작성 구분** — "ready to apply" ≠ "applied". 본인이 SQL Editor 적용 확인 후 진행
5. **개인정보 정책** — DART 공시 텍스트에 임원·주주 개인정보 포함 가능. LLM 요약 시 개인 식별 정보는 일반화 (예: "대표이사" 또는 "최대주주" — 실명 회피)

---

## 8. 참고

- `worker/dart/README.md` — 본 모듈 개요
- `ARCHITECTURE.md` — 본 프로젝트 전체 아키텍처
- `DATA_MODEL.md` — 본 프로젝트 DB 스키마 전체
- `docs/skills/01-scraping.md` ~ `08-*.md` — 기존 작업 가이드 시리즈
- DART OpenAPI: https://opendart.fss.or.kr
- OpenDartReader: https://github.com/FinanceData/OpenDartReader
