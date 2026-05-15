-- ============================================================
-- Phase 1.7 단계 C 검증 SQL
-- 00011_audit_parsing_cols.sql 적용 후 실행
-- ============================================================

-- 1. 신규 컬럼 2개 확인
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'company_financials_history'
  and column_name in ('data_source', 'audit_extraction_metadata')
order by column_name;
-- 기대: 2행
--   audit_extraction_metadata | jsonb | YES
--   data_source                | text  | NO

-- 2. 인덱스 확인
select indexname
from pg_indexes
where tablename = 'company_financials_history'
  and indexname = 'cfh_data_source_idx';
-- 기대: 1행 (cfh_data_source_idx)

-- 3. 기존 행 전체 finstate_api 확인
select data_source, count(*)
from company_financials_history
group by data_source;
-- 기대: finstate_api = 458 (Phase 1.6 부트스트랩 결과)

-- 4. comment 확인
select col_description(
  'company_financials_history'::regclass::oid,
  (
    select ordinal_position
    from information_schema.columns
    where table_name = 'company_financials_history'
      and column_name = 'data_source'
  )
);
-- 기대: 'finstate_api (Phase 1.6, DART finstate API) | audit_report_xml ...' 포함
