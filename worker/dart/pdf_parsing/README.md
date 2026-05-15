# worker/dart/pdf_parsing — 감사보고서 PDF 파싱 모듈

> **Phase 1.7** · DART finstate API 응답 없는 비상장 외감대상의 재무 데이터를 감사보고서 PDF 에서 추출.
> 자사(비케이브) 포함, finstate 응답 없는 회사 약 46개사 대상.

## 위치 in 본 프로젝트

본 모듈은 Phase 1.6 (DART 통합) 의 한계를 보완하는 후속 모듈. 별도 프로젝트 아니라 본 레포의 **Phase 1.7**.

```
Phase 0     — 환경 ✅
Phase 1     — 무신사 수집 ✅
Phase 1.5   — 회사 마스터 (정적 시드) ✅
Phase 1.6   — DART 통합 — finstate API 기반 ✅ (단계 F 대기)
Phase 1.7   — 감사보고서 PDF 파싱 ⬜ ← 본 모듈
Phase 2     — 탐지·매칭·LLM ⬜
Phase 3     — 발송·viewer 운영화 ⬜
```

**선행 조건**: Phase 1.6 단계 F (cron 등록) 완료. Phase 1.7 은 Phase 1.6 부트스트랩 결과를 기반으로 대상 회사 확정.

## 왜 만드는가

Phase 1.6 부트스트랩 후 발견:
- finstate API 응답 없는 회사 약 46개사
- 자사(비케이브) 포함
- DART 사이트에는 감사보고서 PDF 가 있지만 API 로 표준화된 재무 데이터 못 가져옴

자사 재무 데이터 없이는 경쟁사 비교 viewer 의 의미가 반감. 따라서 PDF 파싱으로 보완.

## 기존 모듈과의 관계

```
worker/dart/
├── README.md                  (Phase 1.6 진입점 — 이미 존재)
├── financials.py              (Phase 1.6 — finstate API)
├── disclosures.py             (Phase 1.6 — list API)
├── corp_mapping.py            (Phase 1.6 — find_corp_code)
├── pdf_parsing/               ← 본 Phase 1.7 신설
│   ├── README.md              (본 파일)
│   ├── target_selector.py     (대상 회사 선정)
│   ├── pdf_fetcher.py         (DART document API 로 PDF 다운로드)
│   ├── llm_extractor.py       (Claude Vision API 로 재무 추출)
│   └── main.py                (CLI)
└── main.py                    (Phase 1.6 — 기존 CLI, --mode pdf-parsing 추가)

worker/ingest/
└── dart_writer.py             (Phase 1.6 — upsert_financials 재사용)
```

⚠️ **재무 적재 모듈 재사용**: `worker/ingest/dart_writer.py` 의 `upsert_financials` 함수 그대로 사용. 본 모듈은 fetcher 만 추가, writer 는 같은 거 사용. 컨벤션 일관.

## 데이터 영향

새 테이블 없음. 기존 `company_financials_history` 에 source 구분 컬럼만 추가 (마이그레이션 00011).

```sql
alter table company_financials_history
  add column if not exists data_source text not null default 'finstate_api',
  add column if not exists pdf_extraction_metadata jsonb;
-- data_source: 'finstate_api' (Phase 1.6) | 'audit_report_pdf' (Phase 1.7)
-- pdf_extraction_metadata: PDF 파일명·페이지·신뢰도 등 추적 정보
```

이유:
- 같은 회사가 finstate API + PDF 두 source 다 있을 수도 (예외 케이스)
- 운영 중 PDF 추출 정확도 검증 시 source 별 분리 필요
- viewer 에 출처 표시 가능

## 결정된 정책 (2026-05-16 정호철 확정)

1. **대상 범위**: 공시 있는 비상장 전체. 정확한 수는 부트스트랩 결과로 확정 (약 46개사 추정)
2. **파싱 방식**: LLM 비전 (Claude API) — 정확도 우선
3. **임시 자사 처리**: 없음. 본 Phase 구현 완료 시까지 자사 재무 데이터 없는 상태
4. **로드맵 위치**: Phase 1.6 바로 다음

자세한 결정 배경은 `docs/skills/10-pdf-parsing.md` §4 + `docs/DECISIONS.md` ADR-018~021 참조.

## 보안·거버넌스

- Claude API 키: `.env` 의 `ANTHROPIC_API_KEY` (gitignore 처리)
- DART API 키: 기존 `.env` 의 `DART_API_KEY` 재사용
- 감사보고서 PDF: 임시 디렉토리 (`/tmp/dart_pdf/`) 다운로드 후 처리. 적재 완료 후 삭제 또는 보존 정책 결정 필요
- 추출된 재무 데이터에 개인정보 포함 안 됨 (재무제표 자체는 회사 단위 숫자)
- 본 모듈의 비용은 Claude API 사용량 기준. 부트스트랩 1회성 비용 약 $50~$250 추정 (회사·PDF 길이에 따라)

## 작업 단계 (Phase 1.7.A ~ 1.7.G)

순서대로 진행. 각 단계 끝에 검증 후 다음.

- **A**: Anthropic API 키 발급 + 라이브러리 설치 + Vision API smoke test
- **B**: 대상 회사 선정 (Phase 1.6 부트스트랩 결과 기반)
- **C**: 마이그레이션 00011 (`company_financials_history` 컬럼 추가)
- **D**: DART `document` API 로 PDF 다운로드 모듈
- **E**: Claude Vision API 로 재무 추출 모듈 + 프롬프트 v1
- **F**: 자사(비케이브) 1개사 × 10년 부트스트랩 + 사람 검증
- **G**: 전체 대상 회사 부트스트랩 (사람 검토 후 적재)

A~F = Phase 1.7 본채 (약 15시간 작업)
G = 부트스트랩 (실행 1~2시간 + 사람 검증 5시간)

자세한 작업 내용은 `docs/skills/10-pdf-parsing.md` §3 참조.

## Claude Code 가 본 모듈 작업할 때

다음 파일들 작업 전 반드시 읽기:

1. `worker/dart/pdf_parsing/README.md` — 본 파일
2. `docs/skills/10-pdf-parsing.md` — 작업 가이드
3. `worker/dart/financials.py`, `worker/dart/disclosures.py` — Phase 1.6 패턴
4. `worker/dart/models.py` — CompanyFinancials 모델 (그대로 재사용)
5. `worker/ingest/dart_writer.py` — upsert_financials 재사용

작업 후 보고는 **정확한 숫자·표** 로. "verified" 같은 흐릿한 표현 금지.

## 참고

- DART OpenAPI 의 `document` 엔드포인트: 공시 원문 파일 다운로드
- Anthropic Claude API Vision: https://docs.anthropic.com/en/docs/build-with-claude/vision
- 본 프로젝트 ARCHITECTURE.md, DATA_MODEL.md
