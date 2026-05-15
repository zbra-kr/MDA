# Claude Code 작업 지시

다음을 수행해라:

## 입력 파일

이 zip 안의 3개 파일을 입력으로 사용한다 (레포 루트의 `companies/` 디렉토리에 풀어둘 것):

- `companies/companies.csv` — 98개 패션 회사 마스터 (상장 49 + 비상장 49)
- `companies/company_brand_mapping.csv` — 회사 → 브랜드 매핑 181건 (confidence 표시)
- `companies/schema_proposal_00006.md` — 스키마 설계와 규칙

## 출력 파일

다음 2개 파일을 생성한다:

1. **`supabase/migrations/00006_companies.sql`**
   - `companies` 테이블 생성
   - `brands` 테이블에 `company_id`, `company_mapping_confidence` 컬럼 추가
   - 인덱스, RLS, 헬퍼 뷰 `v_company_brand_summary` 생성
   - `company_brand_mapping_log` 추적 테이블 생성
   - 자세한 사양은 `schema_proposal_00006.md` 참조

2. **`supabase/seed_companies.sql`**
   - `companies` 98건 INSERT (CSV 그대로)
   - 매핑 처리: CSV 각 행에 대해 brands 매칭 시도, 있으면 update / 없으면 skip
   - 매핑 시도 결과를 `company_brand_mapping_log` 에 기록
   - 마지막에 비케이브 회사 → covernat/lee/wakywilly 브랜드 강제 매핑

## 작업 전 반드시 읽을 것

1. `CLAUDE.md` — 프로젝트 규칙
2. `supabase/migrations/` 의 기존 마이그레이션 5개 — 컨벤션 파악용
3. `companies/schema_proposal_00006.md` — 본 작업의 사양

## 작업 후 검증

- 생성된 SQL 을 로컬 검증 (가능하면 supabase CLI 또는 psql)
- 검증이 어려우면 syntax check 만이라도
- 본 마이그레이션 적용 후 실행할 검증 쿼리는 schema_proposal 의 "검증 쿼리" 섹션 참조

## 주의

- 외부 검증 없이 SQL 을 한 번에 길게 쓰지 말 것. 섹션 별로 나눠서 작성하고 syntax check
- 한글 문자열 UTF-8 인코딩 주의
- 새 마이그레이션은 **00006** 번호. 기존 파일 수정 금지
- 비케이브 (is_own=true) 처리 잊지 말 것
- 매핑은 기존 brands 가 있을 때만 적용 (없으면 SKIP — 새로 INSERT 금지)

작성 후 ruff check, 그리고 생성된 SQL 의 첫 20줄과 마지막 20줄을 보여줘.
