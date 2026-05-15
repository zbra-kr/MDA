-- ============================================================
-- B.CAVE Competitor Radar - 감사보고서 XML 파싱 data_source 분리
-- Version: 1.0
-- Date: 2026-05-16
--
-- 적용 순서: 00010 이후 (이 파일)
--
-- 변경 내용:
--   company_financials_history 에 컬럼 2개 추가.
--   Phase 1.6 finstate API 응답 없는 회사 재무를
--   감사보고서 XML 에서 추출해 동일 테이블에 적재하기 위한 source 구분.
--
-- 결정 배경:
--   - finstate_api 가 더 정확 → ON CONFLICT 시 우선 보존
--   - audit_report_xml 은 finstate API 응답 없는 회사에만 사용
--   - PDF 파싱 아님, XML 직접 파싱 (Vision API 불필요, 비용 $0)
--
-- 설계 문서: docs/skills/10-pdf-parsing.md §2.2
-- 결정:      docs/DECISIONS.md ADR-019 (Superseded), ADR-022 (신설)
-- ============================================================

alter table company_financials_history
  add column if not exists data_source              text  not null default 'finstate_api',
  add column if not exists audit_extraction_metadata jsonb;

comment on column company_financials_history.data_source is
  'finstate_api (Phase 1.6, DART finstate API) | audit_report_xml (Phase 1.7, 감사보고서 XML 파싱)';

comment on column company_financials_history.audit_extraction_metadata is
  '감사보고서 추출 메타: source_rcept_no, source_rcept_dt, equity_method (extracted|calculated), xml_parser_version 등';

create index if not exists cfh_data_source_idx
  on company_financials_history(data_source);
