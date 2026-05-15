# 10. 감사보고서 PDF 파싱 — DART API 한계 보완

> **Phase 1.7** · `worker/dart/pdf_parsing/` 모듈의 작업 가이드.
> 본 문서는 `docs/skills/09-dart-integration.md` 의 후속편.

## 0. 본 작업의 위치

- **선행**: Phase 1.6 완료 (단계 F 까지). 부트스트랩 결과로 대상 회사 확정 가능
- **후행**: Phase 2 (이상탐지·LLM)
- **선행 문서**: `worker/dart/pdf_parsing/README.md`, `docs/skills/09-dart-integration.md`

본 작업의 범위:
- DART finstate API 응답 없는 회사들의 재무를 감사보고서 PDF 에서 추출
- Claude Vision API 활용
- 자사(비케이브) 포함

---

## 1. 의도와 목표

### 1.1 왜 만드는가

Phase 1.6 부트스트랩 후 데이터 양상:
- 재무 보유: 52/98 사 (53%)
- 미보유: 46사 — 자사(비케이브) 포함

원인: DART `finstate` API 는 **사업보고서 제출 의무 회사** 대상. 외감 대상이지만 사업보고서 제출 의무 미만 (자산·매출 기준) 회사들은 **감사보고서만 제출** → API 응답 없음.

본 시스템 의도는 회사 마스터 동적 갱신 + 경쟁사 비교 viewer. **자사 데이터 없으면 viewer 의 의미가 반감**. 따라서 PDF 파싱으로 보완.

### 1.2 본 작업의 산출물

- `worker/dart/pdf_parsing/` 모듈 (target_selector, pdf_fetcher, llm_extractor, main)
- `worker/ingest/dart_writer.py` 의 `upsert_financials` 재사용 (수정 안 함)
- 마이그레이션 00011 (data_source 컬럼 추가)
- 약 46개사 × 평균 5년 = 약 230행 재무 데이터 신규 적재 (실제 수치는 부트스트랩 결과로 확정)

### 1.3 비-목표

- **새 fetcher 자체 만들지 않음**: DART `document` API 로 PDF 다운로드 후 LLM 으로 추출하는 단일 파이프라인만
- **모든 회사 적용 안 함**: finstate API 응답 있는 회사 (52사) 는 본 모듈 안 사용. 그 데이터가 더 정확
- **PDF 보관 정책 없음**: 추출 후 임시 PDF 삭제 (또는 별도 결정 필요)
- **표준 재무제표 외 데이터 추출 안 함**: 매출·영업이익·순이익·자산·부채·자본 6개만

---

## 2. 데이터 모델

### 2.1 새 테이블 없음

`company_financials_history` 그대로 재사용. 컬럼만 2개 추가.

### 2.2 마이그레이션 00011

```sql
alter table company_financials_history
  add column if not exists data_source text not null default 'finstate_api',
  add column if not exists pdf_extraction_metadata jsonb;

comment on column company_financials_history.data_source is 
  'finstate_api (Phase 1.6) | audit_report_pdf (Phase 1.7)';

comment on column company_financials_history.pdf_extraction_metadata is 
  'PDF 추출 메타: source_rcept_no, page_numbers, llm_model, llm_confidence, extracted_at';

create index cfh_data_source_idx on company_financials_history(data_source);
```

⚠️ Phase 1.6 의 기존 행은 모두 `data_source='finstate_api'` 가 됨 (default). 본 모듈로 새로 들어오는 행은 `data_source='audit_report_pdf'`.

### 2.3 적재 정책 — 중복 처리

같은 (company_id, fiscal_year, fiscal_quarter) 에 finstate API 데이터 + PDF 추출 데이터 둘 다 있을 수 있음. 우선순위:

- **finstate_api 우선**: API 응답 있으면 그게 정확함 (DART 표준 추출)
- **audit_report_pdf 보조**: API 응답 없는 경우만 사용

ON CONFLICT 정책:
```sql
-- pdf_writer 가 적재할 때
insert into company_financials_history (...)
values (...)
on conflict (company_id, fiscal_year, fiscal_quarter, is_consolidated)
do update set
  -- finstate_api 행이 이미 있으면 UPDATE 안 함 (PDF 가 덮어쓰지 않음)
  revenue_mkrw = case 
    when company_financials_history.data_source = 'finstate_api' 
    then company_financials_history.revenue_mkrw  -- 기존 값 유지
    else excluded.revenue_mkrw                     -- PDF 데이터로 덮어쓰기
  end,
  -- 다른 컬럼들도 같은 패턴
  -- ...
```

---

## 3. 작업 단계 (A~G)

각 단계 끝에 검증 후 다음. 검증 안 통과하면 다음 단계 금지.

### 단계 A: Anthropic API + Vision smoke test

- [ ] Anthropic API 키 발급 (https://console.anthropic.com) — 정호철 개인 명의
- [ ] `.env` 에 `ANTHROPIC_API_KEY=` 추가
- [ ] `pip install anthropic` (또는 본 레포 의존성 관리 방식 따라)
- [ ] `scripts/anthropic_vision_smoke_test.py` 작성
  - 샘플 PDF 1장 다운로드 (예: 비케이브 감사보고서 1장)
  - Claude API 의 `messages.create(model='claude-3-5-sonnet-...', messages=[...image...])` 호출
  - 응답에서 텍스트 추출 확인
- [ ] 검증: smoke test 결과 "재무제표 한 줄 OCR" 정확하게 나오는지

### 단계 B: 대상 회사 선정

- [ ] `worker/dart/pdf_parsing/target_selector.py` 작성
- [ ] 핵심 함수: `select_pdf_targets() -> List[CompanyTarget]`
  - companies LEFT JOIN dart_corp_codes
  - finstate API 응답 없는 (company_financials_history 에 행 없는) 회사 찾기
  - disclosures 에 audit report (report_nm 에 "감사보고서" 포함) 있는 회사만
- [ ] 검증 SQL:

```sql
-- finstate API 응답 없으면서 감사보고서 공시 있는 회사
select 
  c.name,
  c.listing_type,
  d.corp_code,
  count(distinct dis.id) as audit_report_count,
  min(dis.rcept_dt) as oldest_audit,
  max(dis.rcept_dt) as latest_audit
from companies c
join dart_corp_codes d on d.company_id = c.id
left join company_financials_history h on h.company_id = c.id
left join disclosures dis on dis.company_id = c.id 
  and dis.report_nm like '%감사보고서%'
where h.id is null  -- finstate 응답 없음
  and dis.id is not null  -- 감사보고서 공시 있음
group by c.name, c.listing_type, d.corp_code
order by audit_report_count desc;
```

기대: 46개사 내외. 자사(비케이브) 포함되어야 함.

⚠️ 단계 B 결과로 **최종 대상 수자 확정**. Phase 1.7 의 부트스트랩 범위는 이 결과 기준.

### 단계 C: 마이그레이션 00011

- [ ] `supabase/migrations/00011_pdf_parsing_cols.sql` 생성 (§2.2)
- [ ] Supabase SQL Editor 에서 적용 — 정호철 직접
- [ ] 검증:
```sql
select column_name, data_type from information_schema.columns
where table_name='company_financials_history' 
  and column_name in ('data_source', 'pdf_extraction_metadata');
-- 기대: 2행

-- 기존 행 모두 data_source='finstate_api' 인지
select data_source, count(*) from company_financials_history group by data_source;
-- 기대: finstate_api = 458행 (Phase 1.6 부트스트랩 결과)
```

### 단계 D: DART document API — PDF 다운로드

- [ ] `worker/dart/pdf_parsing/pdf_fetcher.py` 작성
- [ ] 핵심 함수: `fetch_audit_report_pdf(rcept_no) -> Path`
  - OpenDartReader 의 `dart.document(rcept_no)` 또는 DART 원본 API 호출
  - 응답이 ZIP 또는 XML 일 가능성 큼 — 라이브러리 동작 확인 후 결정
  - PDF 파일 추출 → `/tmp/dart_pdf/{rcept_no}.pdf`
  - 반환: PDF 파일 경로
- [ ] rate limit: 호출 사이 1초 (DART 정중 운영)
- [ ] 단일 회사 검증: 비케이브 최신 감사보고서 1건 다운로드

### 단계 E: LLM 추출 모듈

- [ ] `worker/dart/pdf_parsing/llm_extractor.py` 작성
- [ ] 핵심 함수: `extract_financials_from_pdf(pdf_path, year) -> CompanyFinancials | None`
  - PDF → 페이지 이미지 변환 (pdf2image 또는 pdfplumber)
  - 재무제표 페이지 식별 (보통 PDF 의 처음 5~10페이지에 재무상태표·손익계산서)
  - Claude Vision API 호출:
    - model: `claude-sonnet-4-...` 또는 `claude-opus-4-...` (정확도 우선)
    - 이미지 + 프롬프트 (아래 참조)
  - 응답 JSON 파싱 → CompanyFinancials
  - 응답 신뢰도 낮으면 None 반환

- [ ] 프롬프트 v1 (`worker/dart/pdf_parsing/prompts.py`):

```python
EXTRACT_FINANCIALS_PROMPT = """
당신은 한국 회계법인의 감사보고서를 분석하는 재무 분석가입니다.

다음 감사보고서 PDF 이미지에서 {year} 사업연도의 재무제표 핵심 6개 값을 추출하세요.

추출 대상 (모두 백만원 단위로 변환):
1. 매출액 (revenue_mkrw)
2. 영업이익 (operating_income_mkrw) — 영업손실이면 음수
3. 당기순이익 (net_income_mkrw) — 당기순손실이면 음수
4. 자산총계 (total_assets_mkrw)
5. 부채총계 (total_liabilities_mkrw)
6. 자본총계 (total_equity_mkrw)

추가 정보:
- 연결재무제표 vs 별도재무제표 구분 (is_consolidated: true/false)
- 신뢰도 평가 (high/medium/low)

⚠️ 주의:
- 매출액 = 수익 (revenue). 매출원가 아님
- 영업이익이 명시 안 됐으면 (매출 - 매출원가 - 판관비) 계산
- 백만원 단위 변환 시 단위 표기 정확히 ('천원'·'백만원'·'억원' 등)
- 부호 정확히 (적자는 음수)
- 확실하지 않으면 null 반환 (잘못된 추측 금지)

출력 JSON 형식만 반환:
{
  "is_consolidated": true,
  "revenue_mkrw": 318900,
  "operating_income_mkrw": -56570,
  "net_income_mkrw": 15400,
  "total_assets_mkrw": 224900,
  "total_liabilities_mkrw": 111700,
  "total_equity_mkrw": 113100,
  "confidence": "high",
  "reasoning": "재무상태표는 PDF 페이지 5, 손익계산서는 페이지 7에서 추출. 단위는 백만원으로 명시됨."
}
"""
```

- [ ] 응답 검증:
  - JSON 파싱 실패 시 1회 재시도
  - 6개 필드 다 null 이면 None 반환
  - confidence='low' 이면 적재 보류 (사람 검토 큐로)

- [ ] 비용 관리:
  - 1회 호출당 약 $0.01~$0.05 (Sonnet) 또는 $0.05~$0.15 (Opus)
  - 부트스트랩 추정: 46사 × 5년 × 1.5회 (재시도 포함) = **약 350회 호출**
  - Sonnet 사용 시 약 $7~$18, Opus 사용 시 약 $18~$53

### 단계 F: 자사(비케이브) 1개사 부트스트랩 + 사람 검증

- [ ] `worker/dart/pdf_parsing/main.py` CLI 작성
  - `--mode single --corp-code XXX --year YYYY`
  - `--mode bootstrap-pdf-financials`
- [ ] 단일 회사 검증:
  - 비케이브 (corp_code=01461509) 10년 (2016~2025) 감사보고서 추출
  - 추출 결과 출력 후 적재 보류 (사람 검증 단계)
- [ ] **사람 검증 단계** — 정호철 가 비케이브 메모리(FY2024 매출 3,189억 등) 와 대조:
  - 매출 정확한지
  - 영업이익·순이익 부호 정확한지 (메모리: 조정 영업손실 -565.7억)
  - 자산·부채·자본 합리적인지
- [ ] 검증 통과 후 적재 명령 (정호철 직접):
  - `python -m worker.dart.pdf_parsing.main --mode single --corp-code 01461509 --apply`

⚠️ 단계 F 통과 = 비케이브 1개사 정확하게 추출됐다는 검증. 이게 통과해야 단계 G 진입.

### 단계 G: 전체 대상 부트스트랩 (사람 검토 후 적재)

- [ ] 단계 B 에서 확정한 46개사 (또는 정확한 수자) 부트스트랩
  - `--mode bootstrap-pdf-financials` 실행
  - **자동 적재 안 함** — 결과 CSV 출력
- [ ] 정호철 가 CSV 검토:
  - 매출 규모가 회사 규모와 일치하는지 (영세 회사가 매출 1조 라고 나오면 의심)
  - 부호 (적자/흑자) 합리적인지
- [ ] 검토 통과한 행만 적재
- [ ] 검토 못 통과한 행은 별도 큐 → 사람이 PDF 직접 보고 정정

---

## 4. 결정사항 (확정 — 2026-05-16 정호철)

| # | 결정 | 답 | 영향 |
|---|---|---|---|
| Q1 | PDF 파싱 대상 범위 | 공시 있는 비상장 전체 (약 46개사) | 대상 수자는 단계 B 에서 확정 |
| Q2 | 파싱 방식 | LLM 비전 (Claude API) | 정확도 우선, 부트스트랩 비용 $20~$50 |
| Q3 | 본 Phase 구현 대기 중 자사 재무 처리 | 없음 — 자사 데이터 없는 상태 | Phase 1.6 완료 후 본 Phase 까지 자사 viewer 비어 있음 |
| Q4 | 로드맵 위치 | Phase 1.7 — Phase 1.6 바로 다음 | Phase 2 진입 전 본 Phase 완료 필수 |

본 결정들은 `docs/DECISIONS.md` 에 ADR-018~021 로 추가.

---

## 5. 위험·고려사항

### 5.1 PDF 포맷 다양성
한국 감사보고서 PDF 는 회계법인마다 포맷 다름:
- 안진·삼정·삼일·딜로이트 등 Big 4 + 중소 회계법인
- 표 구조·계정과목 순서·페이지 레이아웃 차이 큼

LLM 비전이 대부분 처리하지만 — 예외 케이스 (이미지 기반 스캔 PDF·표 손상 등) 는 사람 검토 필수.

### 5.2 PDF 파일 크기·페이지 수
- 평균 30~50페이지
- Claude Vision API 는 페이지당 이미지 1장 → 호출당 토큰 비용 큼
- **최적화 필요**: 재무제표 페이지 5~10페이지만 추출 후 LLM 에 전달
- 페이지 식별: 첫 페이지 목차에서 "재무상태표·손익계산서" 위치 추출 또는 키워드 검색

### 5.3 추출 정확도
- LLM 추출은 95%+ 추정. 100% 아님
- **사람 검토 단계 필수** (단계 G)
- 검토 도구: viewer 에 "PDF 출처 + 추출값" 표시 + "수정" 버튼

### 5.4 부트스트랩 시간
- 46사 × 10년 = 460회 PDF 다운로드 + LLM 호출
- 1회당 약 30초~1분 (다운로드 10초 + LLM 20~50초)
- 총 **약 4~8시간** 부트스트랩
- 정호철 직접 실행 (백그라운드 가능)

### 5.5 LLM 비용
- 1회 호출 약 $0.01~$0.15 (모델·페이지 수에 따라)
- 부트스트랩 1회성 약 $20~$100
- 운영 (분기 갱신): 회사당 분기 1회 = 46 × 4 = 184회/년 = 약 $5~$30/년

### 5.6 PDF 보관 정책
- 임시 다운로드: `/tmp/dart_pdf/`
- 추출 완료 후 삭제 vs 보존?
- 보존 시: 검증 추적 용이, 디스크 사용
- 삭제 시: 재추출 필요 시 재다운로드
- **정책 미확정** — 단계 D 작업 시 결정 (Claude Code 가 본인에게 질문)

---

## 6. 소요 시간

| 단계 | 작업 | 시간 |
|---|---|---|
| A | Anthropic API + smoke test | 30분 |
| B | 대상 회사 선정 | 1시간 |
| C | 마이그레이션 00011 | 30분 |
| D | PDF 다운로드 모듈 | 2시간 |
| E | LLM 추출 모듈 + 프롬프트 | 4시간 |
| F | 자사 1개사 검증 (10년) | 1시간 (LLM 호출 + 사람 검증) |
| G | 전체 부트스트랩 + 사람 검토 | 1~2시간 실행 + 5시간 검토 |
| **합계** | | **약 15시간** |

---

## 7. Claude Code 작업 시 주의

본 모듈 작업 시 다음 패턴 엄수:

1. **PDF 안 다운로드 상태에서 LLM 코드 작성 금지** — 실제 PDF 구조 확인 후 프롬프트 정정
2. **단계 F 통과 전 단계 G 금지** — 자사 검증 안 된 상태에서 46개사 적재는 비용·시간 낭비
3. **LLM 응답 JSON 파싱 실패 처리** — 1회 재시도, 그래도 실패 시 None + 로그
4. **추출 결과 검증 단계 필수** — 적재 전 정호철 검토 큐 (자동 적재 금지)
5. **개인정보 보호** — 감사보고서 텍스트에 개인 이름 (대표·감사인 등) 있어도 본 추출 결과에는 포함 안 함 (재무 6개 값만)

---

## 8. 참고

- `worker/dart/pdf_parsing/README.md` — 본 모듈 진입점
- `docs/skills/09-dart-integration.md` — Phase 1.6 (선행)
- Claude Vision API: https://docs.anthropic.com/en/docs/build-with-claude/vision
- DART document API: https://opendart.fss.or.kr/guide/main.do?apiGrpCd=DS005
