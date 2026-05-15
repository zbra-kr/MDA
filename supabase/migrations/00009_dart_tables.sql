-- ============================================================
-- B.CAVE Competitor Radar - DART OpenAPI 통합 스키마
-- Version: 1.0
-- Date: 2026-05-16
--
-- 적용 순서: ... → 00006 → 00007 → 00008 → 00009 (이 파일)
--            00010 은 이 파일 이후
--
-- 변경 내용:
--   1. dart_corp_codes  — 98개사 ↔ DART 8자리 코드 매핑
--   2. company_financials_history — 재무 시계열 (10년 부트스트랩 대상)
--   3. disclosures       — 공시 메타 (10년 부트스트랩 대상)
--   4. 각 테이블 RLS (anon read)
--
-- 설계 문서: docs/skills/09-dart-integration.md §2.1
-- 결정:      docs/DECISIONS.md ADR-012 ~ ADR-016
--
-- ⚠️ corp_cls 컬럼 없음 (2026-05-16 정호철 결정):
--    상장/비상장 구분은 stock_code IS NOT NULL 로 추론.
-- ============================================================


-- ============================================================
-- 1. dart_corp_codes — 98개사 ↔ DART corp_code 매핑
-- ============================================================

create table dart_corp_codes (
  company_id        uuid        primary key references companies(id),
  corp_code         text        not null unique,   -- DART 8자리 고유번호
  corp_name         text        not null,          -- DART 등록명
  stock_code        text,                          -- 상장사 종목코드 6자리 (비상장=NULL)
  ceo_name          text,                          -- 대표이사명 (초기 NULL, 갱신 예정)
  business_number   text,                          -- 사업자등록번호 (매핑 검증용)
  last_synced_at    timestamptz,
  notes             text,
  created_at        timestamptz default now()
);

comment on table dart_corp_codes is
  '98개사 ↔ DART corp_code 매핑. stock_code IS NOT NULL = 상장사. corp_cls 컬럼 제외 (ADR-016 정정).';
comment on column dart_corp_codes.corp_code is
  'DART 8자리 고유번호. opendart.fss.or.kr 에서 조회.';
comment on column dart_corp_codes.stock_code is
  '상장사 종목코드 6자리. NULL = 비상장. 상장/비상장 구분은 이 컬럼으로 추론.';
comment on column dart_corp_codes.ceo_name is
  '대표이사명. 초기 NULL, DART finstate() 결과에서 갱신 예정.';

create index dart_corp_codes_stock_idx on dart_corp_codes(stock_code)
  where stock_code is not null;

alter table dart_corp_codes enable row level security;
create policy "anon read dart_corp_codes"
  on dart_corp_codes for select to anon using (true);


-- ============================================================
-- 2. company_financials_history — 재무 시계열
-- ============================================================

create table company_financials_history (
  id                      uuid        primary key default gen_random_uuid(),
  company_id              uuid        references companies(id) not null,
  fiscal_year             int         not null,
  fiscal_quarter          int,                        -- 1~4 (NULL=연간)
  report_type             text        not null,        -- 'annual'|'half'|'q1'|'q3'

  -- 손익계산서 (단위: 백만원)
  revenue_mkrw            bigint,
  operating_income_mkrw   bigint,
  net_income_mkrw         bigint,

  -- 재무상태표 (단위: 백만원)
  total_assets_mkrw       bigint,
  total_liabilities_mkrw  bigint,
  total_equity_mkrw       bigint,

  -- 메타
  is_consolidated         boolean     default true,
  reporting_currency      text        default 'KRW',
  source_disclosure_id    uuid,                        -- disclosures.id (FK 나중에 추가 가능)
  fetched_at              timestamptz default now(),

  unique (company_id, fiscal_year, fiscal_quarter, is_consolidated)
);

comment on table company_financials_history is
  '재무 시계열. 2016~2025 10년 부트스트랩 대상. 단위 백만원(mkrw).';
comment on column company_financials_history.fiscal_quarter is
  '1~4 또는 NULL(연간). annual report = NULL, half = 2, q1 = 1, q3 = 3.';
comment on column company_financials_history.report_type is
  'DART report type: annual(11011)|half(11012)|q1(11013)|q3(11014).';
comment on column company_financials_history.is_consolidated is
  'true=연결재무제표, false=별도재무제표. 기본 연결.';

create index cfh_company_period_idx on company_financials_history(
  company_id, fiscal_year desc, fiscal_quarter desc nulls first
);
create index cfh_year_idx on company_financials_history(fiscal_year);

alter table company_financials_history enable row level security;
create policy "anon read company_financials_history"
  on company_financials_history for select to anon using (true);


-- ============================================================
-- 3. disclosures — 공시 메타
-- ============================================================

create table disclosures (
  id                  uuid        primary key default gen_random_uuid(),
  company_id          uuid        references companies(id) not null,

  -- DART 메타
  rcept_no            text        not null unique,   -- DART 접수번호 (14자리)
  report_nm           text        not null,          -- 공시 제목
  flr_nm              text,                          -- 제출인명
  rcept_dt            date        not null,          -- 접수일
  rm                  text,                          -- 비고 (정정·첨부 표시)

  -- 분류
  disclosure_type     text        not null,          -- 'A:정기'|'B:주요사항'|'D:지분'
  disclosure_subtype  text,

  -- 본문·LLM (Phase 2 에서 채움)
  dart_url            text        not null,
  raw_summary         text,
  llm_summary         text,
  llm_severity        text        check (llm_severity in ('high','medium','low')),
  llm_processed_at    timestamptz,

  -- 알림
  notified_to_slack   boolean     default false,
  fetched_at          timestamptz default now()
);

comment on table disclosures is
  '공시 메타. 10년 부트스트랩 대상. 원문 다운로드 없음 (URL 저장만).';
comment on column disclosures.rcept_no is
  'DART 공시 접수번호 14자리. 전역 고유. UNIQUE 제약.';
comment on column disclosures.disclosure_type is
  'A=정기공시, B=주요사항보고, D=지분공시.';
comment on column disclosures.notified_to_slack is
  '부트스트랩 INSERT 시 true로 시작 (폭증 방지). 정상 cron부터 false→알림 발송.';

create index disclosures_company_dt_idx   on disclosures(company_id, rcept_dt desc);
create index disclosures_type_dt_idx      on disclosures(disclosure_type, rcept_dt desc);
create index disclosures_pending_llm_idx  on disclosures(llm_processed_at)
  where llm_processed_at is null;
create index disclosures_pending_slack_idx on disclosures(notified_to_slack)
  where notified_to_slack = false;

alter table disclosures enable row level security;
create policy "anon read disclosures"
  on disclosures for select to anon using (true);
