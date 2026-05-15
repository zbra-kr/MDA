# 00006 마이그레이션 — companies 테이블 추가 + brands 연결

> Claude Code 에게: 이 문서와 함께 제공된 `companies.csv` `company_brand_mapping.csv` 두 파일을
> 입력으로 받아 `supabase/migrations/00006_companies.sql` 와 `supabase/seed_companies.sql`
> 두 파일을 생성해야 한다.

## 배경

- 무신사 경쟁사 모니터링의 단위가 **브랜드** 가 아니라 **회사** 인 경우가 많다 (한 회사가 여러 브랜드 운영)
- 패션 상장사 49개 + 비상장 49개 = **98개 회사** 마스터 데이터를 한 번에 박는다
- 회사 ↔ 브랜드는 1:N 관계
- 본 데이터는 **임시 시드** — 영업·기획팀의 공식 경쟁사 데이터로 추후 교체 예정

## 결정사항 (이미 확정 — 다시 묻지 말 것)

- 회사 단위는 `companies` 신규 테이블
- `brands` 에 `company_id uuid references companies(id) nullable` 추가
- 회사 → 브랜드는 1:N (지금 모델)
- 브랜드 매핑은 `confidence` 표시로 들어가고, 운영자가 viewer 에서 검토·수정 가능해야 함

## companies 테이블 스키마 (제안)

```sql
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- 회사명 (한글)
  name_alt text,                                -- 이전 사명 또는 별칭
  is_own boolean default false,                 -- 자사 여부 (B.CAVE = 비케이브 1건)
  listing_type text check (listing_type in ('listed','unlisted')) not null,

  -- 재무 (백만원 단위, 출처: DART 2026.04 기준)
  revenue_2025_mkrw bigint,
  revenue_2024_mkrw bigint,
  revenue_yoy_pct numeric(5,1),
  op_income_2025_mkrw bigint,
  op_income_2024_mkrw bigint,
  op_income_yoy_pct numeric(8,1),               -- 적자전환 시 큰 절댓값 가능 (-856.0 등)
  op_margin_2025_pct numeric(5,1),

  -- 메타
  op_status_note text,                          -- 적자전환·적자지속 등
  fiscal_note text,                             -- '6월 결산법인' 등
  notes text,

  source text default 'dart_2026_04',           -- 데이터 출처
  created_at timestamptz default now()
);

create unique index companies_name_uniq on companies(name);
create index companies_is_own_idx on companies(is_own) where is_own = true;
create index companies_listing_idx on companies(listing_type);
```

## brands 테이블 변경

```sql
alter table brands
  add column if not exists company_id uuid references companies(id),
  add column if not exists company_mapping_confidence text
    check (company_mapping_confidence in ('high','medium','low','unknown'));

create index if not exists brands_company_idx on brands(company_id);

comment on column brands.company_id is
  '소속 회사. 0006 마이그레이션으로 도입. seed 매핑 후 운영자가 viewer 에서 보정 가능.';
comment on column brands.company_mapping_confidence is
  '회사 매핑 신뢰도. high=확정, medium=확인필요, low=추정, unknown=조사필요.';
```

## RLS

```sql
alter table companies enable row level security;
create policy "anon read companies" on companies for select to anon using (true);
-- service_role 은 RLS bypass
```

## 헬퍼 뷰 — 회사 단위 모니터링

```sql
-- 회사별 매핑된 브랜드 수, 무신사 노출 브랜드 수
create or replace view v_company_brand_summary as
select
  c.id,
  c.name,
  c.is_own,
  c.listing_type,
  c.op_margin_2025_pct,
  c.op_status_note,
  count(b.id) as brand_count,
  count(b.id) filter (where b.musinsa_brand_id is not null) as musinsa_present_count
from companies c
left join brands b on b.company_id = c.id
group by c.id, c.name, c.is_own, c.listing_type, c.op_margin_2025_pct, c.op_status_note;

grant select on v_company_brand_summary to anon;
grant select on v_company_brand_summary to authenticated;
```

## seed_companies.sql 생성 규칙

### 1) companies INSERT (98건)

`companies.csv` 각 행을 INSERT. 헤더 컬럼 → 테이블 컬럼 매핑 (이름이 거의 동일).
- `notes` 컬럼은 빈 문자열이면 NULL
- `company_name_alt` 컬럼명은 테이블에서 `name_alt`
- 비케이브는 `is_own = true`

### 2) brands 매핑 적용 (181건의 시도)

`company_brand_mapping.csv` 의 각 행에 대해:

```sql
-- 1. companies 에서 company_id 조회
-- 2. brands 에서 brand_slug_guess 로 매칭되는 행 찾기
--    (정확 일치 또는 LIKE 'brand_slug_guess%' 등 완화 매칭은 권장 안 함 - 일단 정확 일치만)
-- 3. 있으면 brands.company_id 와 company_mapping_confidence 업데이트
-- 4. 없으면 새로 INSERT 하지 말고 SKIP (이유: brands 는 무신사 실데이터로
--    채워지는 테이블. 매핑 시점에 없는 brand_slug 는 아직 무신사에 등장 안 한 것.
--    나중에 무신사 수집에서 등장하면 그때 매핑 후처리)
```

이 SKIP 정책이 핵심이다. 매핑은 **기존 brands 행에 회사를 붙이는 작업**이지, 브랜드를 새로 만드는 작업이 아니다.

### 3) 매핑 결과 로깅용 임시 테이블

매핑 작업 결과를 추적하기 위해, seed 끝에 다음을 추가:

```sql
-- 매핑 시도 로그 (한 번 보고 drop 해도 됨)
create table if not exists company_brand_mapping_log (
  id serial primary key,
  company_name text,
  brand_name text,
  brand_slug_guess text,
  confidence text,
  matched boolean,
  brand_id uuid,
  created_at timestamptz default now()
);

-- ... INSERT 들이 끝난 후
-- select matched, count(*) from company_brand_mapping_log group by matched;
-- 으로 몇 건이 실제로 매칭됐는지 확인 가능
```

## 주의사항

1. **0006 적용 순서**: 00001 → 00002 → 00004 → 00003 → 00005 → **00006** 마지막
2. **자사 (`is_own=true`) 정합성**: 회사 마스터에서 비케이브는 `is_own=true`, brands 에서 자사 3개(covernat, lee, wakywilly)는 이미 `is_own=true`. 이 둘은 별개로 유지하되, covernat/lee/wakywilly 의 company_id 가 비케이브 회사를 가리키도록 매핑.
3. **확인 후 추후 마이그레이션 가능 사항**: viewer 가 회사 모니터링 UI 만들 때 `companies` 정렬 기준 추가 등 — 이번엔 안 함
4. **CSV 의 한글 회사명**: SQL 문자열로 그대로 들어감. UTF-8 인코딩 확인.

## 검증 쿼리 (생성 후 적용 결과 확인용)

```sql
-- 1. companies 행 수
select count(*) from companies;  -- 98 예상

-- 2. 자사 회사
select * from companies where is_own = true;  -- 비케이브 1건

-- 3. 매핑 성공 건수
select matched, count(*) from company_brand_mapping_log group by matched;
-- matched=true 가 30~50건 예상 (현재 brands 가 무신사 수집 초기라 매핑 가능한 슬러그가 적음)

-- 4. 매칭된 브랜드 샘플
select b.slug, b.name, c.name as company_name, b.company_mapping_confidence
from brands b
join companies c on c.id = b.company_id
order by b.company_mapping_confidence, c.name
limit 20;

-- 5. 매칭 안 된 brands 슬러그 (회사 매핑 추후 작업 대상)
select count(*) from brands where company_id is null;
```

## 향후 작업 (이번 범위 아님)

- 무신사 카테고리 확장으로 새 brand_slug 들이 brands 에 더 채워지면, mapping 재실행
- viewer 에 회사 단위 대시보드 추가 (`v_company_brand_summary` 활용)
- 영업·기획팀 공식 데이터로 companies + 매핑 교체
