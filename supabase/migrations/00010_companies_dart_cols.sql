-- ============================================================
-- B.CAVE Competitor Radar - companies DART 캐시 컬럼 추가
-- Version: 1.0
-- Date: 2026-05-16
--
-- 적용 순서: 00009 이후 (00009 와 독립적이나 번호로 묶음)
--
-- 변경 내용:
--   companies 테이블에 DART 최신값 캐시 컬럼 7개 추가.
--   viewer 가 매번 history 조인 없이 companies SELECT 한 번으로 최신값 표시용.
--   dart_writer 가 history INSERT 후 이 컬럼들을 UPDATE 한다.
--
-- 설계 문서: docs/skills/09-dart-integration.md §2.2
-- ============================================================

alter table companies
  add column if not exists latest_fiscal_year             int,
  add column if not exists latest_fiscal_quarter          int,
  add column if not exists latest_revenue_mkrw            bigint,
  add column if not exists latest_operating_income_mkrw   bigint,
  add column if not exists latest_financials_synced_at    timestamptz,
  add column if not exists last_disclosure_date           date,
  add column if not exists last_disclosure_rcept_no       text;

comment on column companies.latest_fiscal_year is
  '가장 최근 적재된 재무 연도. dart_writer 가 갱신.';
comment on column companies.latest_fiscal_quarter is
  '가장 최근 적재된 분기. NULL=연간. dart_writer 가 갱신.';
comment on column companies.latest_revenue_mkrw is
  '최신 매출액 (백만원). viewer 빠른 표시용 캐시.';
comment on column companies.latest_operating_income_mkrw is
  '최신 영업이익 (백만원). viewer 빠른 표시용 캐시.';
comment on column companies.latest_financials_synced_at is
  '재무 마지막 동기화 시각.';
comment on column companies.last_disclosure_date is
  '가장 최근 공시 접수일. dart_writer 가 갱신.';
comment on column companies.last_disclosure_rcept_no is
  '가장 최근 공시 접수번호.';
