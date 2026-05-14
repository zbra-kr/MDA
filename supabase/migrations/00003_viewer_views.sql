-- ============================================================
-- B.CAVE Competitor Radar - Viewer Views & RPCs
-- Version: 1.0
-- Date: 2026-05-14
-- Source: Claude Design handoff (MDA viewer-handoff bundle)
--
-- 적용 순서: 00001_init.sql → 00002_pgvector.sql →
--           00004_viewer_schema_patch.sql → 00003_viewer_views.sql
-- (주의: 00004를 00003보다 먼저 적용해야 함. v_pipeline_today가
--  daily_reports.stages 컬럼에 의존하기 때문. 파일명 번호와 적용
--  순서가 다른 점에 유의 — 다음 정리 시 번호 재정렬 예정.)
--
-- All objects are SELECT-only for the `anon` role. Write paths
-- (agent_analyses_feedback, sku_actions) are at the bottom and
-- require the `authenticated` role.
-- ============================================================

-- -----------------------------------------------------------------
-- 1. v_today_findings
-- One row per anomaly detected on the latest report date, joined to
-- product, brand, latest snapshot, and match counts.  This is the
-- workhorse of the dashboard table + the AI insight rail.
-- -----------------------------------------------------------------
create or replace view v_today_findings as
with latest_report as (
  select report_date from daily_reports order by report_date desc limit 1
),
latest_snapshot as (
  select distinct on (product_id)
    product_id, snapshot_date, rank_main, current_price, discount_rate,
    review_count, rating, wishlist_count
  from product_snapshots
  order by product_id, snapshot_date desc
),
prev_snapshot as (
  select distinct on (product_id)
    product_id, rank_main as prev_rank, wishlist_count as prev_wishlist,
    current_price as prev_price
  from product_snapshots
  where snapshot_date < (select report_date from latest_report)
  order by product_id, snapshot_date desc
),
match_counts as (
  select competitor_product_id, count(*) as matched_sku_count
  from product_matches
  where own_sku is not null
  group by competitor_product_id
)
select
  a.id                            as anomaly_id,
  a.detected_on,
  a.anomaly_type,
  a.severity,
  a.evidence,
  p.id                            as product_id,
  p.musinsa_no,
  p.name                          as product_name,
  p.url                           as product_url,
  b.id                            as brand_id,
  b.name                          as brand_name,
  b.slug                          as brand_slug,
  b.is_own                        as brand_is_own,
  ls.rank_main,
  ls.current_price,
  ls.wishlist_count,
  ls.review_count,
  ps.prev_rank,
  ps.prev_wishlist,
  ps.prev_price,
  (ls.rank_main - ps.prev_rank)   as delta_rank_1d,
  coalesce(mc.matched_sku_count, 0) as matched_sku_count
from anomalies a
join products p          on p.id = a.product_id
join brands b            on b.id = p.brand_id
left join latest_snapshot ls on ls.product_id = p.id
left join prev_snapshot   ps on ps.product_id = p.id
left join match_counts    mc on mc.competitor_product_id = p.id
where a.detected_on = (select report_date from latest_report);

grant select on v_today_findings to anon;
grant select on v_today_findings to authenticated;

-- -----------------------------------------------------------------
-- 2. v_pipeline_today
-- Unrolls the pipeline stages of the most recent daily report into
-- rows for the sidebar.  Assumes daily_reports has a JSONB column
-- `stages` shaped like:
--   [{name: 'scrape', status: 'ok', started_at: '...', ended_at: '...'}]
-- -----------------------------------------------------------------
create or replace view v_pipeline_today as
select
  s ->> 'name'                  as stage_name,
  s ->> 'status'                as status,
  (s ->> 'started_at')::timestamptz as started_at,
  (s ->> 'ended_at')::timestamptz   as ended_at,
  ((s ->> 'ended_at')::timestamptz - (s ->> 'started_at')::timestamptz) as duration,
  ordinality                    as stage_order
from daily_reports r,
  lateral jsonb_array_elements(coalesce(r.stages, '[]'::jsonb)) with ordinality s
where r.report_date = (select report_date from daily_reports order by report_date desc limit 1)
order by stage_order;

grant select on v_pipeline_today to anon;
grant select on v_pipeline_today to authenticated;

-- -----------------------------------------------------------------
-- 3. f_severity_daily(start, end)
-- Daily counts by severity tier for the stacked bar chart.
-- -----------------------------------------------------------------
create or replace function f_severity_daily(
  start_date date,
  end_date   date
) returns table (
  date date,
  high int,
  med  int,
  low  int
) language sql stable as $$
  with d as (
    select generate_series(start_date, end_date, interval '1 day')::date as date
  )
  select
    d.date,
    coalesce(count(a.id) filter (where a.severity >= 0.80), 0)::int as high,
    coalesce(count(a.id) filter (where a.severity >= 0.50 and a.severity < 0.80), 0)::int as med,
    coalesce(count(a.id) filter (where a.severity < 0.50), 0)::int as low
  from d
  left join anomalies a on a.detected_on = d.date
  group by d.date
  order by d.date;
$$;

grant execute on function f_severity_daily(date, date) to anon;
grant execute on function f_severity_daily(date, date) to authenticated;

-- -----------------------------------------------------------------
-- 4. f_product_trend(product_id, days)
-- Snapshot time series for a single product.  Feeds:
--   - Single product rank trajectory chart (anomaly.html)
--   - Sparklines in the dashboard table (batch via in (...) at call site)
-- -----------------------------------------------------------------
create or replace function f_product_trend(
  p_product_id uuid,
  p_days int default 30
) returns table (
  date          date,
  rank_main     int,
  rank_realtime int,
  current_price int,
  discount_rate int,
  wishlist_count int,
  review_count  int,
  rating        numeric
) language sql stable as $$
  select
    snapshot_date as date,
    rank_main,
    rank_realtime,
    current_price,
    discount_rate,
    wishlist_count,
    review_count,
    rating
  from product_snapshots
  where product_id = p_product_id
    and snapshot_date >= current_date - p_days
  order by snapshot_date;
$$;

grant execute on function f_product_trend(uuid, int) to anon;
grant execute on function f_product_trend(uuid, int) to authenticated;

-- -----------------------------------------------------------------
-- 5. f_anomaly_kpis(anomaly_id)
-- All KPI fields for the anomaly detail page in a single row.
-- -----------------------------------------------------------------
create or replace function f_anomaly_kpis(p_anomaly_id uuid)
returns table (
  rank_main      int,
  delta_rank_1d  int,
  delta_rank_7d  int,
  wishlist_count int,
  delta_wishlist_pct numeric,
  review_velocity_x numeric,
  matched_sku_count int,
  severity       numeric,
  anomaly_type   text
) language sql stable as $$
  with target as (
    select a.id as anomaly_id, a.product_id, a.severity, a.anomaly_type, a.detected_on
    from anomalies a where a.id = p_anomaly_id
  ),
  today as (
    select rank_main, wishlist_count, review_count
    from product_snapshots, target
    where product_snapshots.product_id = target.product_id
      and snapshot_date = target.detected_on
  ),
  d1 as (
    select rank_main, wishlist_count, review_count
    from product_snapshots, target
    where product_snapshots.product_id = target.product_id
      and snapshot_date = target.detected_on - 1
  ),
  d7 as (
    select rank_main, wishlist_count, review_count
    from product_snapshots, target
    where product_snapshots.product_id = target.product_id
      and snapshot_date = target.detected_on - 7
  ),
  avg14 as (
    select avg(review_count) as avg_reviews
    from product_snapshots, target
    where product_snapshots.product_id = target.product_id
      and snapshot_date between target.detected_on - 14 and target.detected_on - 1
  ),
  matches as (
    select count(*)::int as matched
    from product_matches, target
    where product_matches.competitor_product_id = target.product_id
      and own_sku is not null
  )
  select
    today.rank_main,
    (today.rank_main - d1.rank_main),
    (today.rank_main - d7.rank_main),
    today.wishlist_count,
    case when d7.wishlist_count = 0 then null
         else round(((today.wishlist_count::numeric - d7.wishlist_count) / d7.wishlist_count) * 100, 1)
    end,
    case when avg14.avg_reviews = 0 then null
         else round(today.review_count::numeric / avg14.avg_reviews, 1)
    end,
    matches.matched,
    target.severity,
    target.anomaly_type
  from target, today
  left join d1 on true
  left join d7 on true
  left join avg14 on true
  left join matches on true;
$$;

grant execute on function f_anomaly_kpis(uuid) to anon;
grant execute on function f_anomaly_kpis(uuid) to authenticated;

-- -----------------------------------------------------------------
-- 6. f_brand_trend(brand_ids[], metric, days)
-- Wide-format series for the multi-line trend page.
-- metric in: 'rank_main', 'wishlist_count', 'review_count', 'current_price'
-- -----------------------------------------------------------------
create or replace function f_brand_trend(
  p_brand_ids uuid[],
  p_metric    text,
  p_days      int default 30
) returns table (
  date     date,
  brand_id uuid,
  value    numeric
) language plpgsql stable as $$
begin
  if p_metric not in ('rank_main', 'wishlist_count', 'review_count', 'current_price') then
    raise exception 'invalid metric: %', p_metric;
  end if;

  return query execute format($q$
    select
      s.snapshot_date,
      p.brand_id,
      avg(s.%I)::numeric as value
    from product_snapshots s
    join products p on p.id = s.product_id
    where p.brand_id = any($1)
      and s.snapshot_date >= current_date - $2
    group by s.snapshot_date, p.brand_id
    order by s.snapshot_date
  $q$, p_metric)
  using p_brand_ids, p_days;
end;
$$;

grant execute on function f_brand_trend(uuid[], text, int) to anon;
grant execute on function f_brand_trend(uuid[], text, int) to authenticated;

-- -----------------------------------------------------------------
-- 7. f_own_sku_status(own_sku)
-- Read from `own_sku_cache` (populated by the worker from Snowflake).
-- -----------------------------------------------------------------
create table if not exists own_sku_cache (
  own_sku       text primary key,
  pos_price     int,
  stock_ea      int,
  sales_7d      int,
  refreshed_at  timestamptz default now()
);
alter table own_sku_cache enable row level security;
create policy "anon read own_sku_cache" on own_sku_cache for select to anon using (true);

create or replace function f_own_sku_status(p_own_sku text)
returns table (
  pos_price int,
  stock_ea  int,
  sales_7d  int,
  stock_tier text,
  refreshed_at timestamptz
) language sql stable as $$
  select
    pos_price,
    stock_ea,
    sales_7d,
    case
      when stock_ea < 200 then 'low'
      when stock_ea < 500 then 'mid'
      else 'high'
    end as stock_tier,
    refreshed_at
  from own_sku_cache
  where own_sku = p_own_sku;
$$;

grant execute on function f_own_sku_status(text) to anon;
grant execute on function f_own_sku_status(text) to authenticated;


-- =================================================================
-- Write tables (require authenticated user)
-- =================================================================

create table if not exists agent_analyses_feedback (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references agent_analyses(id) not null,
  user_id     uuid not null,
  verdict     text not null check (verdict in ('accept', 'reject')),
  comment     text,
  created_at  timestamptz default now()
);
alter table agent_analyses_feedback enable row level security;

create policy "authenticated read feedback"
  on agent_analyses_feedback for select to authenticated using (true);

create policy "authenticated write own feedback"
  on agent_analyses_feedback for insert to authenticated
  with check (user_id = auth.uid());

create table if not exists sku_actions (
  id uuid primary key default gen_random_uuid(),
  anomaly_id uuid references anomalies(id) not null,
  own_sku    text not null,
  kind       text not null check (kind in ('promote', 'price_match', 'restock')),
  memo       text,
  assignee   text,
  status     text default 'open' check (status in ('open', 'in_progress', 'done', 'rejected')),
  created_by uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table sku_actions enable row level security;

create policy "authenticated read actions"
  on sku_actions for select to authenticated using (true);

create policy "authenticated write own actions"
  on sku_actions for insert to authenticated
  with check (created_by = auth.uid());

create policy "authenticated update own actions"
  on sku_actions for update to authenticated
  using (created_by = auth.uid());
