# Architecture Decision Records

본 시스템에서 내린 주요 기술적 결정과 그 사유. 새 ADR은 끝에 추가.

---

## ADR-001: 워커는 온프렘 Docker, 뷰어는 Vercel

**상태**: Accepted (2026-05-14)

**맥락**: 처음에는 Vercel에서 전체를 돌리려 했으나 다음 제약 발견:
- Vercel Serverless 함수 250MB 제한 → Playwright Chromium 안 들어감
- Vercel Cron 실행시간 60초 제한 → 무신사 전 카테고리 스크래핑은 1~2시간 소요
- n8n은 stateful이라 serverless 부적합

**결정**: 무거운 워커(스크래퍼·LLM·n8n)는 B.CAVE 온프렘 Docker에서, 뷰어(읽기 UI)만 Vercel.

**결과**:
- 워커 인프라 비용 0원 (기존 서버 활용)
- 뷰어는 Vercel CDN 활용
- Supabase가 두 환경의 다리 역할 (워커는 write, 뷰어는 read)

---

## ADR-002: LLM은 로컬 (Ollama + Qwen)

**상태**: Accepted (2026-05-14)

**맥락**: 초기에는 Claude API를 쓰려 했으나 다음 사유로 변경:
- API 비용 (일 수백건 분석 시 월 수십만 원)
- 자사 Snowflake 데이터를 외부 LLM에 전송하는 거버넌스 부담
- 무신사 경쟁 데이터까지 외부에 보내는 것 부담
- 회사가 자체 LLM 운영 역량을 키워야 한다는 IT팀장의 방향성 (AX TFT 맥락)

**결정**: Ollama 런타임 + Qwen 2.5 14B Instruct (Q4_K_M) 로컬 추론.

**대안 검토**:
- EXAONE 3.5 7.8B (한국어 좋음, 추론 깊이 아쉬움)
- Llama 3.3 70B (한국어 약함, VRAM 부족)
- Qwen 2.5 32B (품질 최고, 하지만 16GB VRAM에 안 들어감)

**결과**:
- 데이터 외부 유출 0
- 비용 0 (전기료 외)
- API 의존성 없음
- 단점: 모델 품질이 Claude/GPT-4 대비 낮음 → 프롬프트 엔지니어링으로 보완

---

## ADR-003: DB는 Supabase

**상태**: Accepted (2026-05-14)

**맥락**: Postgres 자체 호스팅 vs Supabase vs 자사 Snowflake 활용 중 선택.

**결정**: Supabase 클라우드.

**사유**:
- Postgres + pgvector (벡터검색) + Storage (이미지) + RLS + Realtime 한 번에
- Vercel과 궁합 최고 (`@supabase/supabase-js` 직결)
- 자체 호스팅 대비 운영 부담 0
- Snowflake에 경쟁사 데이터를 적재하는 건 부적절 (자사 DW 오염)

**비용**: Pro plan 월 $25 수준 예상 (Phase 3 이후 검토)

---

## ADR-004: 카테고리 트리는 마스터로 별도 관리

**상태**: Accepted (2026-05-14)

**맥락**: 무신사 카테고리 코드(`musinsa_code`)를 products 테이블에 직접 박을 수도 있었음.

**결정**: 별도 `categories` 테이블 + FK. depth와 parent_path를 함께 보관.

**사유**:
- 무신사 카테고리는 트리 구조 (대/중/소분류)
- LLM이 카테고리 컨텍스트("상의 > 셔츠/블라우스 > 캐주얼셔츠")를 받으면 분석 품질 향상
- 카테고리 활성/비활성 토글 필요 (모니터링 제외 카테고리)

---

## ADR-005: product_snapshots는 INSERT only

**상태**: Accepted (2026-05-14)

**맥락**: 매일 상품 상태를 UPDATE할 것인가, INSERT할 것인가.

**결정**: 매일 새 row INSERT. UNIQUE (product_id, snapshot_date)로 중복 방지.

**사유**:
- 시계열 분석이 핵심 (트렌드 그래프, 이동평균, 변화율)
- UPDATE 방식으로는 과거 변화를 복원할 수 없음
- 디스크 비용은 저렴 (Supabase에서 row 1억 개도 무리 없음)
- 90일 후 월간 집계로 압축하는 보관 정책으로 비용 관리

---

## ADR-006: 임베딩은 bge-m3, 차원 1024

**상태**: Accepted (2026-05-14)

**맥락**: 한국어 임베딩 모델 선택지가 많음.

**결정**: BAAI/bge-m3, 차원 1024.

**대안**:
- KURE-v1 (한국어 최적화, 1B 파라미터, 너무 무거움)
- multilingual-e5-large (1024차원, 한국어 OK, bge보다 약간 약함)
- intfloat/multilingual-e5-large (성능 비슷)

**사유**:
- bge-m3는 다국어 + dense + sparse + multi-vector 지원
- Ollama에서 직접 호스팅 가능 (별도 인프라 불필요)
- 1024차원이 pgvector의 ivfflat 인덱스에 효율적

---

## ADR-007: 스크래퍼는 Python + Playwright (Node 아님)

**상태**: Accepted (2026-05-14)

**맥락**: Playwright는 Node가 본가, Python은 포트.

**결정**: Python.

**사유**:
- 후속 모듈(detector, matcher, agent) 모두 Python
- Snowflake/Supabase Python SDK 성숙
- pandas/sklearn 기반 통계 탐지에 유리
- 단일 언어 스택으로 운영 단순화

---

## ADR-008: 자사 데이터는 Snowflake에서 read-only로 풀

**상태**: Accepted (2026-05-14)

**맥락**: 자사 데이터를 Supabase에 복제할 것인가, Snowflake에서 매번 풀할 것인가.

**결정**: 분석 시점에 Snowflake에서 풀, 결과 일부만 Supabase에 캐시.

**사유**:
- 자사 데이터의 진실 원천(SoT)은 Snowflake
- 복제하면 동기화 부담
- 분석은 일 1회, 쿼리 비용 미미
- 캐시는 `product_matches.diff_summary`에 핵심 필드만 저장

---

## ADR-009: 프롬프트와 모델 버전은 분석 결과와 함께 저장

**상태**: Accepted (2026-05-14)

**결정**: `agent_analyses` 테이블에 `model_version`, `prompt_version` 컬럼 필수.

**사유**:
- 모델/프롬프트 교체 시 A/B 비교 가능
- 거버넌스 감사 시 추적성 확보
- 환각 발견 시 어떤 버전에서 발생했는지 식별

---

## ADR-010: 자사 brand 11개 확정 (3개 → 11개)

**상태**: Accepted (2026-05-16)

**맥락**: seed.sql 초기에는 자사 brand 3개 (covernat, lee, wakywilly) 로 박았으나, 2026-05-15 새벽 musinsa_brand_id 의미를 정확하게 짚으면서 자사 brand 가 실제로 11개임을 발견.

**발견 과정**:
- musinsa_brand_id 컬럼이 NULL 인 자사 brand 3개를 보다가 "자사도 무신사에서 팔리는데 왜 NULL?" 의문 → 무신사 URL slug 확인 → 자사 brand 7개 추가 누락 발견
- 추가로 `wakywilly` slug 가 무신사 공식 표기 `wackywilly` (c 2번) 와 다른 오타임을 발견
- 자사 4개 (covernatwoman, covernatkids, leekids, 등) 가 이미 cron 자동 등록으로 `is_own=false` 로 들어가 있어 정정 필요

**결정**: 자사 brand 11개로 확정.

| slug | name | musinsa_brand_id |
| --- | --- | --- |
| covernat | 커버낫 | covernat |
| covernatwoman | 커버낫 우먼 | covernatwoman |
| covernatkids | 커버낫 키즈 | covernatkids |
| covernatbeauty | 커버낫 뷰티 | covernatbeauty |
| lee | 리 | lee |
| leekids | 리 키즈 | leekids |
| wakywilly | 와키윌리 | **wackywilly** (slug 와 다름) |
| fallett | 팔렛 | fallett |
| wrangler | 랭글러 | wrangler |
| namerclothing | 네이머클로딩 | namerclothing |
| thrasher | 트레셔 | thrasher |

**결과**:
- 비케이브 brand_count 3 → 11 정정
- 그동안 "타사 미검토"로 잡혀 있던 자사 4개 brand 의 상품 8건도 자동으로 자사 매출에 합산됨
- wakywilly → wackywilly slug 정정은 FK 영향 점검 후 별도 작업 (Phase 4 백로그)
- ON CONFLICT DO NOTHING 만으로는 기존 행 정정이 안 되므로, 별도 UPDATE 로 자사 승급 처리

**교훈**:
- musinsa_brand_id 같은 외부 식별자 의미를 명확히 문서화해야 운영 중 발견되는 누락·오타 가능성
- seed 데이터의 정확성 검증을 Phase 1.5 검증 게이트에 포함시킬 것

---

## ADR-011: musinsa_brand_id 의미와 백필 정책

**상태**: Accepted (2026-05-16)

**맥락**: brands 테이블에 `musinsa_brand_id` 컬럼이 있는데 의미가 흐릿했음. 무신사 brand 페이지 URL `musinsa.com/brand/{slug}` 의 slug 가 곧 musinsa_brand_id 임을 확인.

**결정**: 
- `musinsa_brand_id` = 무신사 URL slug (문자열, 숫자 아님)
- 자사 여부 (is_own) 와 musinsa_brand_id 는 독립적
- 자사 brand 도 무신사 입점 시 musinsa_brand_id 값 있음

**백필 로직**:
- 새 brand INSERT 시: musinsa_brand_id 같이 박음
- 기존 brand 행 (musinsa_brand_id=NULL) 발견 시: 해당 카테고리 수집에 등장한 brand 만 UPDATE 로 백필
- 이미 채워진 행은 건드리지 않음

**한계**:
- 무신사 랭킹 TOP 101 안에 안 등장하는 brand 는 영원히 NULL 유지
- 일부러 채우려면 무신사 brand 검색 API 별도 호출 필요 (Phase 4 백로그)

---

## ADR-012: DART OpenAPI 통합 — 인증키 개인 명의

**상태**: Accepted (2026-05-16) · Phase 1.6 적용 예정

**맥락**: Phase 1.6 DART 통합 시 인증키 발급 주체 결정 필요. 본 프로젝트가 정호철 개인 프로젝트라는 위치 고려.

**결정**: DART OpenAPI 인증키는 정호철 개인 명의로 발급.

**사유**:
- 본 프로젝트는 정호철 개인 프로젝트 (메모리 명시)
- 회사 자산으로 분리하지 않음
- 향후 프로젝트가 사내 정식화될 경우 법인 명의로 재발급 가능 (DART 인증키는 무료, 발급 비용 0)

---

## ADR-013: DART 비상장 매칭 실패 회사 처리

**상태**: Accepted (2026-05-16) · Phase 1.6 적용 예정

**맥락**: 비상장 49개사 중 외감대상 (자산 100억+) 만 DART 공시 대상. 영세 비상장 패션 brand 는 DART 에 정보 없음.

**결정**: 매칭 실패 회사는 `companies` 테이블에 두되 `dart_corp_codes` 행 없음. history·disclosures 자동 갱신 안 됨 (정적 보존).

**대안**:
- (a) **정적 보존** ← 선택. companies 행 유지, 자동 갱신만 안 됨
- (b) deactivate. 매칭 안 되면 companies 에서 비활성화

**사유**:
- 정보 없다고 회사 자체를 빼는 건 정보 손실
- 회사 마스터의 정적 데이터 (Phase 1.5 시드) 는 보존 가치 있음
- 향후 외감대상 진입 시 매핑 추가 가능

---

## ADR-014: DART Slack 알림 정책 — 모든 공시 (도배 감수)

**상태**: Accepted (2026-05-16) · Phase 1.6 Phase 2 통합 시 적용

**맥락**: 98개사 × 평균 월 5건 = 월 약 500건. 영업일 평균 일 16건, 분기말 일 50건+ 가능.

**결정**: 모든 공시 (high·medium·low 다) Slack 알림. 단 자사 (비케이브) 공시는 제외.

**대안 검토**:
- high severity 만 알림 + 모든 공시 DB 저장 (보수적 추천)
- high + medium
- **모든 공시 알림 ← 선택**

**사유** (정호철 결정):
- 도배 감수. 정보가 적게 오는 것보다 많이 오는 게 안전
- LLM 요약으로 길이 자체는 짧음
- 며칠 운영 후 견딜 수 없으면 임계값 조정 가능 (`WHERE llm_severity = 'high'` 추가)

**부트스트랩 폭증 방지**:
- 10년치 부트스트랩으로 INSERT 되는 약 19,600건은 `notified_to_slack=true` 로 시작
- 정상 cron 부터 알림 활성화

---

## ADR-015: DART 재무 부트스트랩 10년

**상태**: Accepted (2026-05-16) · Phase 1.6 적용 예정

**맥락**: 부트스트랩 시 몇 년치 가져올지 결정 필요. 3년·5년·10년·현재년만 선택지.

**결정**: 10년 (2016~2025).

**대안 검토**:
- 5년 (균형적, 추천)
- 3년 (스타트업 신중)
- **10년 ← 선택**

**사유** (정호철 결정):
- 최대로 가져오자. 데이터는 한 번 가져오면 다시 안 가져와도 됨
- API 한도 (10,000/일) 대비 부트스트랩 사용량 (약 3,920건) 여유 큼
- 1회성 약 33분 소요, 디스크 영향 미미 (약 10MB)

**한계 인지**:
- 2016년 데이터는 한국 패션 산업이 무신사 등장 격변 전 — 비교 가치 약함
- viewer 시각화는 보통 최근 5년만 보여줄 듯
- 비상장 일부는 외감대상 시점 이전 데이터 없음

---

## ADR-016: DART 자사 공시 처리 — viewer 표시 yes / Slack 알림 no

**상태**: Accepted (2026-05-16) · Phase 1.6 Phase 2 통합 시 적용

**맥락**: 자사 (비케이브) 공시도 DART 에 발생. 처리 정책 필요.

**결정**: 
- viewer `/companies/[id]` 에서 자사 공시 정상 표시
- Slack 알림에선 자사 제외 (`WHERE c.is_own = false`)

**사유**:
- 자사 공시는 본인 (정호철, IT팀장) 이 이미 알고 있는 정보 → Slack 알림 불필요
- viewer 에는 다른 사용자도 들어와 회사 단위로 비교 가능해야 함
- 자사 회사 ID 하드코딩 안 함 — `companies.is_own` 컬럼 기준

---

## ADR-017: 1주일 무인 가동 검증 게이트 1 시작

**상태**: In Progress (2026-05-15 22:00 ~)

**맥락**: Phase 1 본채 완료 + cron 3개 등록 완료 후 7일 무인 가동 검증 시작.

**결정**: 2026-05-15 22:00 부터 7일 (~2026-05-22 22:00) 무인 가동 후 검증 게이트 1 통과 판정.

**관찰 항목**:
- 봇 차단 / IP 블록 발생 횟수 (목표: 0)
- 일평균 신규 product · snapshot · 상세 적재 건수
- 디스크 사용량 추세 (Supabase 500MB 한도)
- timeout · 실패 패턴

**다음 결정 시점**:
- 7일 통과 시 Phase 1.6 (DART 통합) 진입
- 7일 내 봇 차단 발생 시 cron 정책 보수화 (top 줄이기, 딜레이 늘이기)

---

## ADR-018: Phase 1.7 (감사보고서 PDF 파싱) 신설

**상태**: Accepted (2026-05-16)

**맥락**: Phase 1.6 부트스트랩 후 발견 — DART `finstate` API 응답 없는 회사 약 46사 (자사 비케이브 포함). `finstate` 는 사업보고서 제출 의무 회사만 응답, 감사보고서만 제출하는 외감 대상은 API 로 재무 못 가져옴. 자사 재무 없이는 viewer 의미 반감.

**결정**: 별도 Phase 1.7 신설하여 감사보고서 PDF 파싱으로 재무 추출.

**대안**:
- 자사만 수동 INSERT (간단하지만 다른 영세 비상장은 여전히 누락)
- DART 외 데이터 소스 (사내 ERP 등) — 본 시스템 범위 밖

**결과**:
- Phase 1.6 → 1.7 → 2 순서 확정
- 본 Phase 완료 시까지 자사 재무 viewer 비어 있음
- LLM 인프라가 Phase 2 LLM 과 같이 사용 가능

---

## ADR-019: PDF 파싱은 Claude Vision API

**상태**: ~~Accepted~~ **Superseded by ADR-022 (2026-05-16)**

Phase 1.7 단계 A 사전 테스트에서 DART `document()` 가 XML 직접 반환함을 확인.
Vision API 불필요로 결정 변경. ADR-022 참조.

**맥락**: 감사보고서 PDF 파싱 방식 선택 — 전통 OCR vs LLM 비전 vs 하이브리드.

**결정 (당시)**: Claude Vision API 단일 방식.

**대안**:
- Tesseract + 표 인식 — 정확도 60~70%, 검증 비용 큼
- pypdf 텍스트 추출 — 이미지 기반 PDF 에 무력
- LLM 비전 ← 선택 (당시). 정확도 95%+

**사유 (당시)**:
- 한국 감사보고서 PDF 포맷 다양 — 회계법인 (안진·삼정·삼일·딜로이트 등) 별로 다름
- LLM 비전은 표·텍스트 함께 이해
- 부트스트랩 비용 약 $20~$100 1회성, 운영 비용 $5~$30/년
- 본 시스템의 Phase 2 LLM 인프라와 일관

---

## ADR-020: Phase 1.7 구현 대기 중 자사 재무 처리 없음

**상태**: Accepted (2026-05-16)

**맥락**: Phase 1.6 완료 ~ 1.7 완료 사이 (약 1주일 추정) 자사 재무 viewer 표시 정책.

**결정**: 아무것도 안 함. 자사 재무 데이터 없는 상태로 viewer 운영.

**대안**:
- 자사만 수동 INSERT (5분 작업, 한 번에 끝)
- ← 선택: 아무것도 안 함

**사유** (정호철 결정):
- 수동 INSERT 한 번 박으면 PDF Phase 구현 후 자동 추출 결과와 비교 검증 어려움
- "자사 데이터 없는 상태" 자체가 Phase 1.7 의 우선순위·시급도 명확히 보여주는 시그널
- viewer 에 자사 비어 있으면 본인이 진짜 1.7 구현 의지 가짐 (단기 만족 안 함)

---

## ADR-021: Phase 1.7 로드맵 위치 — Phase 1.6 바로 다음

**상태**: Accepted (2026-05-16)

**맥락**: Phase 1.7 의 우선순위 — Phase 1.6 직후 vs Phase 2 결합 vs Phase 4 백로그.

**결정**: Phase 1.7 — Phase 1.6 바로 다음 (Phase 2 진입 전 필수).

**대안**:
- Phase 2 결합 (LLM 인프라 공유)
- Phase 4 백로그 (운영 후 결정)
- ← 선택: Phase 1.7 (1.6 바로 다음)

**사유**:
- 자사 재무 누락은 시스템 의도와 정면 충돌
- Phase 2 (이상탐지) 진입 전 회사 마스터 완전성 확보 필수
- LLM 인프라는 본 Phase 에서 부트스트랩 → Phase 2 에서 재사용 (역방향 의존)

---

## ADR-022: 감사보고서 자동 파싱은 XML 단일 흐름

**상태**: Accepted (2026-05-16) · Phase 1.7 적용 완료

**맥락**:
- ADR-019 에서 Claude Vision API 사용 결정
- Phase 1.7 단계 A·B 진행 후 사전 테스트에서 발견:
  · DART `document(rcept_no)` API 가 XML 반환 (PDF 아님)
  · XML 의 SUMMARY 섹션에 TOT_SALES·TOT_ASSETS·TOT_DEBTS 직접 추출 가능
  · BODY/TE 섹션에 영업이익·당기순이익 직접 추출 가능
  · 2016년 (가장 오래된) 4/4건 XML 동일 형식 확인
  · 비케이브 FY2024 검증: 매출 3,189억 (메모리 일치 오차 0.0%)

**결정**: ADR-019 (Claude Vision API) Superseded. XML 파싱 단일 흐름으로 변경.

**대안**:
- ADR-019 그대로 (Vision API) — 비용·복잡도 무의미
- 하이브리드 (XML 우선 + Vision fallback) — fallback 케이스 없으므로 코드 부담만
- ← 선택: XML 단일 흐름

**결과**:
- 부트스트랩 비용 $0 ($20~100 절감)
- 부트스트랩 시간 약 6분 (예상 4~8시간 → 단축)
- 정확도 100% (DART 원본 구조화 데이터)
- 본 시스템의 Phase 2 LLM 인프라는 분석에만 사용, 추출에 사용 안 함
- `audit_extraction_metadata` 의 `equity_method`:
  · `'extracted'` — TOT_EQUITY 직접 추출
  · `'calculated'` — TOT_ASSETS - TOT_DEBTS 계산
  · 비케이브 6년 데이터는 모두 `'calculated'` (DART XML 에 TOT_EQUITY 없음, 정상)

---

## ADR-023: Phase 2.0 인증·권한 아키텍처

**상태**: Accepted (2026-05-16) · Phase 2.0 단계 A~F 적용 예정

**맥락**: 현재 viewer는 미인증 공개 접근 + service_role 우회 쓰기 구조. 다인 사용 시 행위자 추적 불가, Vercel 배포 전 보안 요건 미충족.

**결정**: Supabase Auth + 이메일+비밀번호 + `@bcave.co.kr` 도메인 제한 + 2단계 권한 (admin / viewer).

**대안 검토**:
- Magic Link — SMTP 안정성 우려, 사내 UX 낯섦으로 기각
- SSO (Google·Microsoft) — 연동 복잡도 대비 사내 규모에 과잉으로 기각
- Magic Link + 비밀번호 병행 — 구현 복잡도 증가로 기각

**결과**:
- 공개 읽기(anon SELECT)는 유지. 쓰기 경로에만 인증 주입.
- `supabaseAdmin()`(service_role)은 RLS bypass 용도로 제한 유지. 호출 전 세션 검증 필수.
- actor 필드는 하드코딩 문자열 → `user.email` 동적 주입 (Phase 2.0 단계 F)
- 추후 3단계 권한 고도화 예정 (Notion 별도 메모)

---

## ADR-024: Phase 2.1 이상탐지 임계값 정책

**상태**: Accepted (2026-05-16) · Phase 2.1 단계 B 적용 예정

**맥락**: 이상탐지 6종의 임계값을 어디에 보관하고 어떻게 튜닝할지 결정 필요.

**결정**: 임계값은 코드 상수 (`worker/detectors/_thresholds.py`). 변경은 코드 PR로. DB 설정 테이블은 Phase 4 이후 검토.

**대안 검토**:
- DB 설정 테이블 (`detector_config`) — 코드 배포 없이 값 변경 가능하지만, 변경 이력 추적이 git log에서 사라지는 단점
- viewer에서 조정 UI — 운영 편의성 높으나 Phase 2 범위 초과, 남용 위험

**결과**:
- 임계값 변경 이력 = git log (감사 가능)
- 운영 단순화 (설정 테이블 스키마·UI 불필요)
- 단점: 임계값 바꿀 때마다 배포 필요 → 초기 튜닝 기간(Phase 2.1 단계 H) 중 여러 번 배포 예상

---

## ADR-025: Phase 2.1 LLM 환각 검증 정책

**상태**: Accepted (2026-05-16) · Phase 2.1 단계 E 적용 예정

**맥락**: Qwen 2.5 14B가 입력에 없는 자사 SKU나 가격을 만들어내는 환각 발생 가능. 잘못된 전략 제안이 실무자에게 전달되면 오판 위험.

**결정**: `validators.py`가 `strategy_recommendation` 텍스트에서 SKU 패턴을 정규식으로 추출 → 입력으로 받은 `valid_skus` 목록과 대조. 환각 발견 시 **분석 결과 폐기**, `anomaly.analyzed = false` 유지, 워커 로그에 경보.

**대안 검토**:
- 환각 통과 — 빠르지만 데이터 신뢰 하락
- LLM 재호출 (retry) — latency 2배, 환각이 구조적이면 의미 없음

**결과**:
- 데이터 신뢰 우선 정책
- 환각 발생 anomaly는 다음 날 재분석 대상 (누락 방지)
- 환각 건수를 `agent_analyses` 외부 로그로 추적 → 프롬프트 v2 작성 트리거 기준 (누적 환각 > 분석 5%)

---

## (템플릿) ADR-NNN: 제목

**상태**: Proposed / Accepted / Deprecated / Superseded by ADR-NNN

**맥락**: 

**결정**: 

**대안**: 

**결과**: 
