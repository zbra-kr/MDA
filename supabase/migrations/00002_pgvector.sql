-- ============================================================
-- pgvector index & match function
-- 적용 시기: 00001_init.sql 적용 후, products에 데이터 어느정도 쌓인 뒤
-- (ivfflat은 데이터 충분할 때 만드는 것이 정확도 좋음)
-- ============================================================


-- 벡터 인덱스 (cosine distance)
-- lists 값은 sqrt(row_count) 추천. 1만 row면 100. 데이터 증가 시 reindex.
create index products_embedding_idx
  on products using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);


-- 자사 상품 매칭 함수
-- 사용 예:
--   select * from match_own_products('uuid', 0.75, 5);
create or replace function match_own_products(
  competitor_id uuid,
  match_threshold float default 0.75,
  match_count int default 5
)
returns table (
  own_product_id uuid,
  own_product_name text,
  own_sku text,
  similarity float,
  same_category boolean,
  competitor_price int,
  own_list_price int,
  price_diff_pct numeric
)
language sql stable
as $$
  with comp as (
    select p.id, p.category_id, p.list_price, p.embedding
    from products p
    where p.id = competitor_id
      and p.embedding is not null
  )
  select
    p.id as own_product_id,
    p.name as own_product_name,
    p.own_sku,
    1 - (p.embedding <=> comp.embedding) as similarity,
    (p.category_id = comp.category_id) as same_category,
    comp.list_price as competitor_price,
    p.list_price as own_list_price,
    case
      when comp.list_price > 0
      then round(100.0 * (p.list_price - comp.list_price) / comp.list_price, 1)
      else null
    end as price_diff_pct
  from products p
  cross join comp
  join brands b on b.id = p.brand_id
  where b.is_own = true
    and p.id != competitor_id
    and p.embedding is not null
    and 1 - (p.embedding <=> comp.embedding) >= match_threshold
  order by similarity desc
  limit match_count;
$$;


comment on function match_own_products is
  '경쟁상품 ID로 자사 상품 Top N 매칭. cosine similarity 기반. embedding 인덱스 활용.';