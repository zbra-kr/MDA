-- ============================================================
-- B.CAVE Competitor Radar - Viewer Schema Patch
-- Version: 1.0
-- Date: 2026-05-14
--
-- 목적: Claude Design viewer 핸드오프가 요구하는 스키마 보강.
--       00003_viewer_views.sql 적용 *전에* 먼저 적용할 것.
--
-- 변경 사항:
--   1. daily_reports.stages JSONB 컬럼 추가
--      → v_pipeline_today 뷰가 파이프라인 단계를 펼치는 데 사용.
--      → 워커(n8n)가 각 단계 완료 시 이 배열에 append.
--      → 형태: [{"name":"scrape","status":"ok",
--                "started_at":"...","ended_at":"..."}]
-- ============================================================

-- daily_reports에 stages 컬럼 추가 (없을 때만)
alter table daily_reports
  add column if not exists stages jsonb default '[]'::jsonb;

comment on column daily_reports.stages is
  '파이프라인 단계별 상태 배열. v_pipeline_today 뷰의 소스. '
  '워커가 단계 완료 시 append. '
  '형태: [{name, status(ok|running|pending|error), started_at, ended_at}]';

-- ============================================================
-- 참고: 00003_viewer_views.sql이 생성하는 객체 (여기서 만들지 않음)
--   - own_sku_cache 테이블 (워커가 Snowflake에서 채움)
--   - agent_analyses_feedback 테이블 (뷰어 쓰기 경로)
--   - sku_actions 테이블 (뷰어 쓰기 경로)
-- 위 3개는 00003에 정의되어 있으므로 중복 생성하지 않는다.
-- ============================================================
