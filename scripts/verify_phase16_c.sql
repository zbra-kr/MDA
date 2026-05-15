-- ============================================================
-- Phase 1.6 단계 C 검증 SQL
-- 00009, 00010 마이그레이션 + seed_dart_corp_codes.sql 적용 후 실행
-- ============================================================

-- 1. 신규 테이블 3개 존재
-- 기대: 3행 (dart_corp_codes, company_financials_history, disclosures)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('dart_corp_codes', 'company_financials_history', 'disclosures')
order by table_name;


-- 2. companies 신규 컬럼 7개
-- 기대: 7행
select column_name
from information_schema.columns
where table_name = 'companies'
  and (column_name like 'latest_%' or column_name like 'last_disclosure_%')
order by column_name;


-- 3. dart_corp_codes 시드 적재 결과
-- 기대: total_mapped=98, listed_count=49, unlisted_count=49
select
  count(*)                            as total_mapped,
  count(stock_code)                   as listed_count,
  count(*) filter (where stock_code is null) as unlisted_count
from dart_corp_codes;


-- 4. companies LEFT JOIN — 매핑 누락 회사 (0행이어야 함)
-- 기대: 0행
select c.name, c.listing_type
from companies c
left join dart_corp_codes d on d.company_id = c.id
where d.company_id is null;


-- 5. 인덱스 존재 확인
-- 기대: 7개 이상 (PK 포함)
select indexname, tablename
from pg_indexes
where tablename in ('dart_corp_codes', 'company_financials_history', 'disclosures')
order by tablename, indexname;


-- 6. RLS 정책 확인 (각 3개 테이블에 anon read)
-- 기대: 3행
select tablename, policyname
from pg_policies
where tablename in ('dart_corp_codes', 'company_financials_history', 'disclosures')
order by tablename;
