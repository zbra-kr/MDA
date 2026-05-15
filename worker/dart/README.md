# worker/dart — DART OpenAPI 통합 모듈

> **Phase 1.6** · B.CAVE Competitor Radar 의 회사 마스터 데이터(`companies`) 를 정적 → 동적으로 진화시키는 모듈.
> 무신사 데이터 = 행동 시그널, DART 데이터 = 재무·구조 시그널. 두 차원 결합이 본 시스템의 가치.

## 위치 in 본 프로젝트

본 모듈은 별도 프로젝트 아니라 본 레포의 **Phase 1.6** 이다. 무신사 수집(Phase 1) 다음, 이상탐지(Phase 2) 앞.

```
Phase 0    — 환경 ✅
Phase 1    — 무신사 수집 ✅
Phase 1.5  — 회사 마스터 (정적 시드) ✅
Phase 1.6  — DART 통합 (회사 마스터 → 동적) ⬜  ← 본 모듈
Phase 2    — 탐지·매칭·LLM ⬜
Phase 3    — 발송·viewer 운영화 ⬜
```

**선행 조건**: Phase 1 무신사 자동화 1주일 안정 가동 후 시작.

## 기존 모듈과의 관계

본 모듈은 `worker/scrapers/`, `worker/ingest/` 와 같은 위치의 형제 모듈:

| 기존 | 본 모듈 | 역할 |
| --- | --- | --- |
| `worker/scrapers/musinsa_ranking.py` | `worker/dart/financials.py` | 외부 데이터 수집 |
| `worker/scrapers/musinsa_product.py` | `worker/dart/disclosures.py` | 외부 데이터 수집 |
| `worker/ingest/supabase_writer.py` | `worker/ingest/dart_writer.py` | Supabase 적재 |
| `worker/categories.py` | `worker/dart/corp_mapping.py` | 매핑 헬퍼 |
| `worker/main.py` | `worker/dart/main.py` | CLI 진입점 |

⚠️ **`worker/ingest/dart_writer.py` 는 `ingest/` 안에 둔다** (본 dart/ 폴더가 아니라). 기존 `supabase_writer.py`, `detail_writer.py` 와 같은 위치. 적재 책임은 `ingest/` 패키지가 가진다는 컨벤션 유지.

## 데이터 영향

새 테이블 3개 + 기존 `companies` 컬럼 확장. 마이그레이션 `00009`, `00010`. 자세한 스키마는 `docs/skills/09-dart-integration.md` §2 참조.

기존 `companies` 테이블은 손대지 않고 컬럼 추가만 (`alter table ... add column if not exists`). Phase 1.5 시드 데이터는 보존.

## 결정된 정책 (2026-05-16 정호철 확정)

1. **DART 인증키**: 개인 (정호철 명의)
2. **비상장 매칭 실패 회사**: `companies` 에 두되 자동 갱신 안 됨 (정적 보존)
3. **Slack 알림**: 모든 공시 알림 (도배 감수, 자사 제외)
4. **재무 부트스트랩**: 10년 (2016~2025)
5. **자사(비케이브) 공시**: viewer 표시 yes / Slack 알림 no

자세한 결정 배경은 `docs/skills/09-dart-integration.md` §4 + `docs/DECISIONS.md` 의 ADR 참조.

## 보안·거버넌스

- DART API 키: `.env` 의 `DART_API_KEY` (gitignore 처리됨)
- 본 모듈은 공시 메타데이터만 수집. 공시문 원문 다운로드 안 함
- 자사 (비케이브) 공시는 알림 안 함 (본인이 이미 알고 있음)
- 부트스트랩 시 INSERT 되는 공시는 `notified_to_slack=true` 로 시작 (폭증 방지)
- 본 모듈의 자동 갱신은 거버넌스 문서 `GOVERNANCE.md` 의 "외부 데이터 수집" 정책 따름. DART 는 공공 데이터라 별도 합의 불필요 (무신사와 다름)

## 작업 단계 (Phase 1.6.A ~ 1.6.I)

순서대로 진행. 각 단계 끝에 검증 후 다음.

- **A**: DART 인증키 + 라이브러리 설치
- **B**: 98개사 ↔ corp_code 매핑표 (반자동 + 사람 검토)
- **C**: 마이그레이션 00009, 00010 적용
- **D**: 재무 fetcher + 10년 부트스트랩 (1회성)
- **E**: 공시 fetcher + 10년 부트스트랩 (1회성)
- **F**: 메인 + cron 등록
- **G**: LLM 요약 (Phase 2 LLM 인프라 공유)
- **H**: Slack 알림 (모든 공시, 자사 제외)
- **I**: viewer `/companies/[id]` 시각화

A~F = Phase 1.6 자체 (약 11시간 작업)
G~I = Phase 2 와 같이 진행 (약 12시간)

자세한 작업 내용은 `docs/skills/09-dart-integration.md` §3 참조.

## Claude Code 가 본 모듈 작업할 때

다음 파일들을 작업 전 반드시 읽는다 (CLAUDE.md 규칙):

1. `worker/dart/README.md` — 본 파일
2. `docs/skills/09-dart-integration.md` — 작업 가이드
3. `worker/scrapers/musinsa_ranking.py`, `worker/ingest/supabase_writer.py` — 기존 패턴 참고
4. `supabase/migrations/00001_init.sql`, `00006_companies.sql` — 스키마 컨벤션 참고

작업 후 보고에는 **검증 결과를 정확한 숫자/표로** 포함. "verified" 같은 흐릿한 표현 금지. 마이그레이션 SQL 버그 4개 경험 살려서.

## 참고

- DART OpenAPI: https://opendart.fss.or.kr
- OpenDartReader: https://github.com/FinanceData/OpenDartReader
- 본 프로젝트 ARCHITECTURE.md, DATA_MODEL.md
