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

## (템플릿) ADR-NNN: 제목

**상태**: Proposed / Accepted / Deprecated / Superseded by ADR-NNN

**맥락**: 

**결정**: 

**대안**: 

**결과**: 
