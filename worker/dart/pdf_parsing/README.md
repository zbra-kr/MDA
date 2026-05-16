# worker/dart/pdf_parsing — 감사보고서 자동 파싱 모듈

> **Phase 1.7** · DART finstate API 응답 없는 비상장 외감대상의 재무 데이터를 감사보고서 XML 에서 추출.
> 자사(비케이브) 포함, finstate 응답 없는 45개사 대상.
>
> ⚠️ 폴더명은 `pdf_parsing/` 이지만 실제 구현은 **XML 단일 파싱** (PDF/Vision API 사용 안 함).
> Phase 1.7 단계 A 사전 테스트에서 DART `document()` API 가 XML 을 직접 반환함을 확인.
> ADR-022 참조.

## 위치 in 본 프로젝트

본 모듈은 Phase 1.6 (DART 통합) 의 한계를 보완하는 후속 모듈. 별도 프로젝트 아니라 본 레포의 **Phase 1.7**.

```
Phase 0     — 환경 ✅
Phase 1     — 무신사 수집 ✅
Phase 1.5   — 회사 마스터 (정적 시드) ✅
Phase 1.6   — DART 통합 — finstate API 기반 ✅
Phase 1.7   — 감사보고서 자동 파싱 ✅ ← 본 모듈 (완료)
Phase 2     — 탐지·매칭·LLM ⬜
Phase 3     — 발송·viewer 운영화 ⬜
```

**선행 조건**: Phase 1.6 완료. Phase 1.7 은 Phase 1.6 부트스트랩 결과를 기반으로 대상 회사 확정.

## 왜 만드는가

Phase 1.6 부트스트랩 후 발견:
- finstate API 응답 없는 회사 약 46개사
- 자사(비케이브) 포함
- DART 사이트에는 감사보고서가 있지만 API 로 표준화된 재무 데이터 못 가져옴

자사 재무 데이터 없이는 경쟁사 비교 viewer 의 의미가 반감. 따라서 감사보고서 자동 파싱으로 보완.

## 구현 방식 — XML 단일 파싱

당초 계획은 Claude Vision API (PDF 파싱). Phase 1.7 단계 A 사전 테스트에서 발견:

- DART `document(rcept_no)` API 가 XML str 을 직접 반환 (PDF 아님)
- XML 의 `<SUMMARY>` 섹션에 `TOT_SALES·TOT_ASSETS·TOT_DEBTS` 이미 백만원 단위로 추출 가능
- XML 의 `<BODY>` 섹션에 영업이익·당기순이익 원 단위로 추출 가능
- 2016년 (가장 오래된 보고서) 포함 전체 XML 동일 형식 확인

Vision API 불필요 → 비용 $0, 시간 약 6분 (부트스트랩 실측). ADR-022 (신설) 참조.

## 기존 모듈과의 관계

```
worker/dart/
├── README.md                  (Phase 1.6 진입점 — 이미 존재)
├── financials.py              (Phase 1.6 — finstate API)
├── disclosures.py             (Phase 1.6 — list API)
├── corp_mapping.py            (Phase 1.6 — find_corp_code)
├── pdf_parsing/               ← 본 Phase 1.7 (폴더명 유지, 실구현은 XML)
│   ├── README.md              (본 파일)
│   ├── target_selector.py     (대상 회사 선정)
│   ├── xml_fetcher.py         (DART document API → XML str)
│   ├── xml_parser.py          (XML → CompanyFinancials, lxml recover=True)
│   └── main.py                (CLI: --mode single | bootstrap-audit-financials)
└── main.py                    (Phase 1.6 — 기존 CLI)

worker/ingest/
└── dart_writer.py             (Phase 1.6/1.7 공통 — upsert_financials 재사용)
```

⚠️ **재무 적재 모듈 재사용**: `worker/ingest/dart_writer.py` 의 `upsert_financials` 함수 재사용.
Phase 1.7 에서 `data_source`, `audit_metadata_list` 파라미터 추가.

## 데이터 영향

새 테이블 없음. 기존 `company_financials_history` 에 source 구분 컬럼만 추가 (마이그레이션 00011).

```sql
alter table company_financials_history
  add column if not exists data_source text not null default 'finstate_api',
  add column if not exists audit_extraction_metadata jsonb;
-- data_source: 'finstate_api' (Phase 1.6) | 'audit_report_xml' (Phase 1.7)
-- audit_extraction_metadata: source_rcept_no, source_rcept_dt, equity_method, xml_parser_version
```

이유:
- finstate_api 가 더 정확 → ON CONFLICT 시 우선 보존
- audit_report_xml 은 finstate API 응답 없는 회사에만 사용

## 결정된 정책 (2026-05-16 정호철 확정)

1. **대상 범위**: 공시 있는 비상장 전체. 최종 45개사 확정 (단계 B 결과)
2. **파싱 방식**: DART XML 단일 파싱 (Vision API 불필요, $0)
3. **자본총계 처리**: TOT_EQUITY 있으면 추출, 없으면 TOT_ASSETS - TOT_DEBTS 계산
4. **로드맵 위치**: Phase 1.6 바로 다음 (완료)

자세한 결정 배경은 `docs/skills/10-pdf-parsing.md` + `docs/DECISIONS.md` ADR-019 (Superseded) + ADR-022 참조.

## 보안·거버넌스

- DART API 키: `.env` 의 `DART_API_KEY` (gitignore 처리)
- 추출된 재무 데이터에 개인정보 포함 안 됨 (재무 6개 값만)
- XML 문자열 임시 메모리 처리 (파일 저장 없음, 적재 후 소멸)

## 작업 단계 (완료)

- **A**: ✅ DART document() XML 반환 확인 → Vision API 불필요 결정
- **B**: ✅ 대상 회사 선정 (target_selector.py) — 45개사 확정
- **C**: ✅ 마이그레이션 00011 (data_source + audit_extraction_metadata 컬럼)
- **D**: ✅ xml_fetcher.py + xml_parser.py 작성, 비케이브 FY2024/FY2025 검증 PASS (오차 0~0.3%)
- **E**: ✅ dart_writer.py 확장 + main.py CLI + 전체 45개사 dry-run
- **F (G)**: ✅ 전체 45개사 부트스트랩 완료 — 484건 적재, fail=0

A~G = Phase 1.7 전체 작업 시간 약 3시간 (실측)

## Claude Code 가 본 모듈 작업할 때

다음 파일들 작업 전 반드시 읽기:

1. `worker/dart/pdf_parsing/README.md` — 본 파일
2. `docs/skills/10-pdf-parsing.md` — 작업 가이드
3. `worker/dart/financials.py`, `worker/dart/disclosures.py` — Phase 1.6 패턴
4. `worker/dart/models.py` — CompanyFinancials 모델 (그대로 재사용)
5. `worker/ingest/dart_writer.py` — upsert_financials 재사용

작업 후 보고는 **정확한 숫자·표** 로. "verified" 같은 흐릿한 표현 금지.

## 참고

- DART OpenAPI 의 `document` 엔드포인트: 공시 원문 — XML 반환
- `docs/DECISIONS.md` ADR-022 (XML 단일 파싱 결정 배경)
- 본 프로젝트 ARCHITECTURE.md, DATA_MODEL.md
