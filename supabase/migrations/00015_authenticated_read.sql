-- 00015_authenticated_read.sql
-- 로그인한 사용자(authenticated role)도 모든 공개 테이블을 읽을 수 있도록 RLS 정책 추가.
-- 배경: 기존 정책이 anon 역할만 허용 → 이메일 인증 후 authenticated로 바뀌면 데이터 조회 불가.
-- 해결: anon 정책이 있는 모든 테이블에 authenticated SELECT 정책 추가 (anon 정책은 유지).

create policy "authenticated read agent_analyses" on agent_analyses for select to authenticated using (true);
create policy "authenticated read anomalies" on anomalies for select to authenticated using (true);
create policy "authenticated read brand_audit_log" on brand_audit_log for select to authenticated using (true);
create policy "authenticated read brands" on brands for select to authenticated using (true);
create policy "authenticated read categories" on categories for select to authenticated using (true);
create policy "authenticated read companies" on companies for select to authenticated using (true);
create policy "authenticated read company_brand_mapping_log" on company_brand_mapping_log for select to authenticated using (true);
create policy "authenticated read company_financials_history" on company_financials_history for select to authenticated using (true);
create policy "authenticated read daily_reports" on daily_reports for select to authenticated using (true);
create policy "authenticated read dart_corp_codes" on dart_corp_codes for select to authenticated using (true);
create policy "authenticated read disclosures" on disclosures for select to authenticated using (true);
create policy "authenticated read own_sku_cache" on own_sku_cache for select to authenticated using (true);
create policy "authenticated read product_images" on product_images for select to authenticated using (true);
create policy "authenticated read product_matches" on product_matches for select to authenticated using (true);
create policy "authenticated read product_recommendations" on product_recommendations for select to authenticated using (true);
create policy "authenticated read product_review_summaries" on product_review_summaries for select to authenticated using (true);
create policy "authenticated read product_snaps" on product_snaps for select to authenticated using (true);
create policy "authenticated read product_snapshots" on product_snapshots for select to authenticated using (true);
create policy "authenticated read products" on products for select to authenticated using (true);
create policy "authenticated read promotions" on promotions for select to authenticated using (true);
create policy "authenticated read review_snapshots" on review_snapshots for select to authenticated using (true);
