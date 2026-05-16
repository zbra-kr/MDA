# 10. 감사보고서 자동 파싱 — DART API 한계 보완

> **Phase 1.7** · `worker/dart/pdf_parsing/` 모듈의 작업 가이드 (완료).
> 본 문서는 `docs/skills/09-dart-integration.md` 의 후속편.
>
> ⚠️ 파일명·폴더명은 `pdf-parsing` 이지만 실제 구현은 **XML 단일 파싱**.
> Phase 1.7 단계 A 에서 DART document() 가 XML 반환임을 확인, Vision API 계획 폐기. ADR-022.

## 0. 본 작업의 위치

- **선행**: Phase 1.6 완료 (단계 F 까지). 부트스트랩 결과로 대상 회사 확정 가능
- **후행**: Phase 2 (이상탐지·LLM)
- **선행 문서**: `worker/dart/pdf_parsing/README.md`, `docs/skills/09-dart-integration.md`

본 작업의 범위:
- DART finstate API 응답 없는 회사들의 재무를 감사보고서 XML 에서 추출
- DART `document(rcept_no)` API 직접 호출 → XML str 파싱 (Vision API 불필요, $0)
- 자사(비케이브) 포함

---

## 1. 의도와 목표

### 1.1 왜 만드는가

Phase 1.6 부트스트랩 후 데이터 양상:
- 재무 보유: 52/98 사 (53%)
- 미보유: 46사 — 자사(비케이브) 포함

원인: DART `finstate` API 는 **사업보고서 제출 의무 회사** 대상. 외감 대상이지만 사업보고서 제출 의무 미만 (자산·매출 기준) 회사들은 **감사보고서만 제출** → API 응답 없음.

본 시스템 의도는 회사 마스터 동적 갱신 + 경쟁사 비교 viewer. **자사 데이터 없으면 viewer 의 의미가 반감**. 따라서 감사보고서 자동 파싱으로 보완.

### 1.2 본 작업의 산출물 (완료)

- `worker/dart/pdf_parsing/` 모듈 (target_selector, xml_fetcher, xml_parser, main)
- `worker/ingest/dart_writer.py` 의 `upsert_financials` 확장 (data_source + audit_metadata_list)
- 마이그레이션 00011 (data_source + audit_extraction_metadata 컬럼 추가)
- 45개사 × 평균 10.7건 = 484행 재무 데이터 신규 적재 (실측, 2026-05-16)

### 1.3 비-목표

- **Vision API 사용 안 함**: DART XML 직접 파싱으로 충분 (ADR-022)
- **모든 회사 적용 안 함**: finstate API 응답 있는 회사 (52사) 는 본 모듈 안 사용. 그 데이터가 더 정확
- **PDF 파일 저장 없음**: XML str 을 메모리에서 처리, 임시 파일 없음
- **표준 재무제표 외 데이터 추출 안 함**: 매출·영업이익·순이익·자산·부채·자본 6개만

---

## 2. 데이터 모델

### 2.1 새 테이블 없음

`company_financials_history` 그대로 재사용. 컬럼만 2개 추가.

### 2.2 마이그레이션 00011 (적용 완료)

```sql
alter table company_financials_history
  add column if not exists data_source text not null default 'finstate_api',
  add column if not exists audit_extraction_metadata jsonb;

comment on column company_financials_history.data_source is
  'finstate_api (Phase 1.6, DART finstate API) | audit_report_xml (Phase 1.7, 감사보고서 XML 파싱)';

comment on column company_financials_history.audit_extraction_metadata is
  '감사보고서 추출 메타: source_rcept_no, source_rcept_dt, equity_method (extracted|calculated), xml_parser_version 등';

create index if not exists cfh_data_source_idx on company_financials_history(data_source);
```

⚠️ Phase 1.6 의 기존 행은 모두 `data_source='finstate_api'` (default). 본 모듈로 새로 들어오는 행은 `data_source='audit_report_xml'`.

### 2.3 적재 정책 — 중복 처리

- **finstate_api 우선**: API 응답 있으면 그게 정확 (DART 표준 추출)
- **audit_report_xml 보조**: API 응답 없는 경우만 사용

ON CONFLICT 정책:
```python
# dart_writer.upsert_financials 의 ignore_duplicates 활용
ignore_dup = data_source != 'finstate_api'
# audit_report_xml → ignore_duplicates=True (기존 finstate_api 행 보존)
# finstate_api → ignore_duplicates=False (정확한 데이터로 덮어쓰기)
```

---

## 3. 작업 단계 (A~G) — 완료

각 단계 완료. 실측 결과 기록.

### 단계 A: DART document() 사전 테스트 ✅

- [x] `scripts/anthropic_vision_smoke_test.py` 작성 + 실행
- [x] **발견**: DART `document(rcept_no)` 가 XML str 직접 반환 (PDF/ZIP 아님)
- [x] XML `<SUMMARY>` 섹션에 `TOT_SALES`, `TOT_ASSETS`, `TOT_DEBTS`, `TOT_EQUITY` 이미 백만원 단위
- [x] XML `<BODY>` 섹션에 영업이익·당기순이익 원 단위 추출 가능
- [x] 2016년 포함 가장 오래된 감사보고서 5건 전부 동일 XML 형식 확인
- [x] **결정**: Claude Vision API 계획 폐기, XML 단일 파싱으로 변경 (ADR-022)

### 단계 B: 대상 회사 선정 ✅

- [x] `worker/dart/pdf_parsing/target_selector.py` 작성
- [x] `select_audit_targets(client) -> list[CompanyTarget]`
- [x] 결과: **45개사** (46개 미보유 중 1개사 kind='F' 공시 없음)
- [x] 자사(비케이브) 포함: 6건 (FY2020~FY2025)
- [x] `scripts/build_audit_target_list.py` 작성, `/tmp/audit_targets.csv` 출력

### 단계 C: 마이그레이션 00011 ✅

- [x] `supabase/migrations/00011_audit_parsing_cols.sql` 생성
- [x] Supabase SQL Editor 에서 적용 — 정호철 직접
- [x] 검증: data_source='finstate_api' 458행 확인

### 단계 D: XML fetcher + 파서 ✅

- [x] `worker/dart/pdf_parsing/xml_fetcher.py` 작성
  - `fetch_audit_xml(dart, rcept_no) -> str | None`
  - status:014 (정정공시 원본 삭제) → None + warning log
  - 0.5초 딜레이
- [x] `worker/dart/pdf_parsing/xml_parser.py` 작성
  - `parse_audit_xml(xml_str, company_id, fiscal_year, ...) -> (CompanyFinancials | None, dict)`
  - lxml `recover=True` — 비표준 XML (undefined entity, invalid token) 처리
  - SUMMARY 백만원 단위 직접 추출 + BODY/TE 원→백만원 변환
  - TITLE 텍스트 기반 손익계산서 섹션 탐색 (ATOCID 번호 문서마다 달라 텍스트로 판단)
- [x] 검증: 비케이브 FY2024 오차 0.0~0.3%, FY2025 오차 0.0%

### 단계 E: 적재 CLI ✅

- [x] `worker/ingest/dart_writer.upsert_financials` — `data_source`, `audit_metadata_list` 파라미터 추가
- [x] `worker/dart/pdf_parsing/main.py` CLI 작성
  - `--mode single` (단일 검증, 적재 없음)
  - `--mode bootstrap-audit-financials [--dry-run]`

### 단계 F/G: 전체 부트스트랩 ✅

- [x] dry-run: 45개사 484건 파싱 성공, fail=0, skip=5 (status:014)
- [x] 실제 적재 (2026-05-16 12:16~12:22): 484건, fail=0
- [x] 소요시간: 약 6분 (실측)

---

## 4. 결정사항 (확정 — 2026-05-16 정호철)

| # | 결정 | 답 | 영향 |
|---|---|---|---|
| Q1 | 파싱 대상 범위 | 공시 있는 비상장 전체 (45개사 확정) | 단계 B 결과 기준 |
| Q2 | 파싱 방식 | XML 단일 파싱 (당초 Vision API → 변경) | 비용 $0, ADR-022 |
| Q3 | 자본총계 처리 | TOT_EQUITY 우선 (extracted), 없으면 자산-부채 (calculated) | 비케이브 6년 모두 calculated |
| Q4 | 로드맵 위치 | Phase 1.6 바로 다음 (완료) | Phase 2 진입 가능 |

본 결정들은 `docs/DECISIONS.md` ADR-019 (Superseded) + ADR-022 (신설) 참조.

---

## 5. 위험·고려사항

### 5.1 비표준 XML

DART 제공 XML 중 일부는 HTML 엔티티(`&nbsp;` 등) 또는 잘못된 토큰 포함.
→ `lxml XMLParser(recover=True)` 로 해결. 2026-05-16 부트스트랩에서 fail=0 확인.

### 5.2 손익계산서 미추출

2022년 이전 보고서 일부: BODY 손익계산서 구조 달라 영업이익·순이익 None.
→ SUMMARY 의 revenue·assets·liabilities 는 정상 추출. 6개 중 일부 None 은 허용 (전부 None 일 때만 파싱 실패 처리).

### 5.3 분기 자동 갱신

Phase 1.7 신규 데이터는 분기 1회 갱신 (DART 감사보고서 제출 주기 연 1회).
→ `worker/dart/pdf_parsing/main.py --mode bootstrap-audit-financials` 를 연 1회 실행으로 충분. cron 별도 추가 가능 (4월 초).

---

## 6. 소요 시간 (실측)

| 단계 | 작업 | 시간 |
|---|---|---|
| A | DART XML 확인 + 결정 | 30분 |
| B | 대상 회사 선정 | 30분 |
| C | 마이그레이션 00011 | 20분 |
| D | xml_fetcher + xml_parser + 검증 | 1시간 |
| E | dart_writer 확장 + main.py CLI + dry-run | 30분 |
| F/G | 실제 부트스트랩 6분 | 10분 (실행+확인) |
| **합계** | | **약 3시간 (실측)** |

---

## 7. Claude Code 작업 시 주의

본 모듈 작업 시 다음 패턴 엄수:

1. **단계 D 검증 통과 전 전체 적재 금지** — 자사 검증 없이 45개사 적재는 오류 전파 위험
2. **lxml recover=True 필수** — 표준 ET.fromstring 은 비표준 XML 에서 ParseError
3. **TITLE ATOCID 번호로 손익계산서 탐색 금지** — 문서마다 번호 다름, TITLE 텍스트로 판단
4. **audit_report_xml 적재 시 ignore_duplicates=True** — finstate_api 행 보존
5. **개인정보 보호** — 감사보고서 텍스트에 개인 이름 있어도 재무 6개 값만 추출

---

## 8. 참고

- `worker/dart/pdf_parsing/README.md` — 본 모듈 진입점
- `docs/skills/09-dart-integration.md` — Phase 1.6 (선행)
- `docs/DECISIONS.md` ADR-022 — XML 단일 파싱 결정 배경
- DART document API: https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS005
