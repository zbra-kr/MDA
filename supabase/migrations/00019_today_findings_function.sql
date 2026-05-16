-- ============================================================
-- B.CAVE Competitor Radar — f_today_findings (DAT-02 · DAT-03)
-- Version: 1.0  Date: 2026-05-17
--
-- DAT-02: v_today_findings 는 latest_report_date 고정 → 임의 날짜 조회 불가.
--         f_today_findings(p_date date) 로 파라미터화.
--
-- DAT-03: 미래 agent_analyses 다건 상황에 대비해
--         LATERAL + LIMIT 1 (created_at desc) 로 최신 분석 1건만 조인.
--         현재 v_today_findings 에는 agent_analyses 조인이 없으므로
--         이 함수에서 선제 적용.
--
-- 기존 v_today_findings (00003·00005):
--   - latest_report CTE → daily_reports 의 최신 날짜 고정
--   - anon / authenticated SELECT — 뷰어 대시보드 기본 경로로 유지
-- 이 함수는 날짜 드릴다운·리포트 히스토리 조회를 위해 추가.
--
-- 사용 예 (뷰어 → queries.ts):
--   await sb.rpc("f_today_findings", { p_date: "2026-05-16" })
--
-- ⚠️  자동 적용 금지 — 정호철이 Supabase SQL Editor 에서 적용.
-- ⚠️  적용 전 Supabase 대시보드 → Database Backups 에서 스냅샷 확인 권장.
-- ============================================================

create or replace function public.f_today_findings(
  p_date date default current_date
)
returns table (
  anomaly_id              uuid,
  detected_on             date,
  anomaly_type            text,
  severity                numeric,
  evidence                jsonb,
  product_id              uuid,
  musinsa_no              text,
  product_name            text,
  product_url             text,
  brand_id                uuid,
  brand_name              text,
  brand_slug              text,
  brand_is_own            boolean,
  rank_main               int,
  current_price           int,
  wishlist_count          int,
  review_count            int,
  prev_rank               int,
  prev_wishlist           int,
  prev_price              int,
  delta_rank_1d           int,
  matched_sku_count       bigint,
  analysis_id             uuid,
  strategy_recommendation jsonb
)
language sql stable as $$
  with latest_snapshot as (
    -- 상품당 최신 스냅샷 1건 (distinct on = LATERAL 등가, 실행계획 동일)
    select distinct on (product_id)
      product_id, rank_main, current_price, discount_rate,
      review_count, rating, wishlist_count
    from product_snapshots
    order by product_id, snapshot_date desc
  ),
  prev_snapshot as (
    -- p_date 직전의 스냅샷 (delta 계산용)
    select distinct on (product_id)
      product_id,
      rank_main      as prev_rank,
      wishlist_count as prev_wishlist,
      current_price  as prev_price
    from product_snapshots
    where snapshot_date < p_date
    order by product_id, snapshot_date desc
  ),
  match_counts as (
    select competitor_product_id, count(*) as matched_sku_count
    from product_matches
    where own_sku is not null
    group by competitor_product_id
  )
  select
    a.id                              as anomaly_id,
    a.detected_on,
    a.anomaly_type,
    a.severity,
    a.evidence,
    p.id                              as product_id,
    p.musinsa_no,
    p.name                            as product_name,
    p.url                             as product_url,
    b.id                              as brand_id,
    b.name                            as brand_name,
    b.slug                            as brand_slug,
    b.is_own                          as brand_is_own,
    ls.rank_main,
    ls.current_price,
    ls.wishlist_count,
    ls.review_count,
    ps.prev_rank,
    ps.prev_wishlist,
    ps.prev_price,
    (ls.rank_main - ps.prev_rank)     as delta_rank_1d,
    coalesce(mc.matched_sku_count, 0) as matched_sku_count,
    -- DAT-03: 최신 분석 1건만 — LATERAL + LIMIT 1 으로 팬아웃 방지
    aa.id                             as analysis_id,
    aa.strategy_recommendation
  from anomalies a
  join  products p          on p.id = a.product_id
  join  brands   b          on b.id = p.brand_id
  left join latest_snapshot ls on ls.product_id  = p.id
  left join prev_snapshot   ps on ps.product_id  = p.id
  left join match_counts    mc on mc.competitor_product_id = p.id
  left join lateral (
    select id, strategy_recommendation
    from   public.agent_analyses
    where  anomaly_id = a.id
    order  by created_at desc
    limit  1
  ) aa on true
  where a.detected_on = p_date
  order by a.severity desc;
$$;

grant execute on function public.f_today_findings(date) to anon;
grant execute on function public.f_today_findings(date) to authenticated;

comment on function public.f_today_findings(date) is
  '날짜 파라미터화된 findings 쿼리. v_today_findings 는 latest_report 고정이라 '
  '과거 날짜 조회 불가 → 이 함수로 임의 날짜 드릴다운. '
  'agent_analyses 는 LATERAL + LIMIT 1 (created_at desc) 로 최신 1건만 조인.';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 SQL (적용 후 실행)
-- ────────────────────────────────────────────────────────────────────────────

-- [검증 1] 오늘 findings (기존 v_today_findings 와 건수 비교)
-- select count(*) from f_today_findings(current_date);
-- select count(*) from v_today_findings;

-- [검증 2] 특정 날짜 (과거 날짜)
-- select count(*) from f_today_findings('2026-05-16');

-- [검증 3] anon 실행 권한 확인
-- set role anon;
-- select count(*) from f_today_findings(current_date);
-- reset role;
