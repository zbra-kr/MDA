# Runbook

운영 중 발생할 수 있는 상황과 대응 절차. 인프라파트가 단독 운영 가능한 수준을 목표로 한다.

## 0. 일일 운영 체크리스트 (인프라파트 아침 9시)

- [ ] Slack #competitor-radar 채널에 아침 8시 리포트 도착 확인
- [ ] n8n 대시보드에서 야간 실행 status = success
- [ ] Supabase 대시보드에서 어제 신규 product / snapshot row 수 정상 범위
- [ ] 워커 컨테이너 헬스 OK (`docker compose ps`)
- [ ] Ollama GPU 사용률 정상 (`nvidia-smi`)

## 1. 일반 운영 명령어

### 컨테이너 상태
```bash
docker compose ps
docker compose logs -f worker --tail 200
docker compose logs -f ollama --tail 50
```

### 수동 실행 (테스트용)
```bash
# 특정 카테고리만 스크래핑
docker compose exec worker python -m worker.main --task scrape:ranking --category 001

# 어제자 탐지 재실행
docker compose exec worker python -m worker.main --task detect --date 2026-05-13

# LLM 분석 1건 수동
docker compose exec worker python -m worker.main --task analyze --anomaly-id <uuid>

# 리포트 재생성
docker compose exec worker python -m worker.main --task report --date 2026-05-13
```

### Supabase 빠른 점검
```sql
-- 최근 7일 일별 수집량
select snapshot_date, count(*) snapshots, count(distinct product_id) products
from product_snapshots
where snapshot_date >= current_date - 7
group by 1 order by 1 desc;

-- 오늘 탐지된 이상 건수
select anomaly_type, count(*), avg(severity)
from anomalies
where detected_on = current_date
group by 1;

-- 어제 LLM 분석 latency 분포
select percentile_cont(0.5) within group (order by latency_ms) p50,
       percentile_cont(0.95) within group (order by latency_ms) p95,
       max(latency_ms) max_ms
from agent_analyses
where created_at::date = current_date - 1;
```

## 2. 장애 시나리오

### 2.1 무신사 봇 차단 (Playwright 실패율 급증)

**증상**: `worker` 로그에 captcha 페이지 / 403 / 봇 차단 메시지

**대응**:
1. 즉시 n8n 워크플로우 비활성화
2. User-Agent 변경, 세션 쿠키 클리어
3. 24시간 휴지 후 재시도
4. 3회 재발 시 → IT팀장 보고, 법무팀과 협의

### 2.2 Supabase 장애

**증상**: 적재 실패, Vercel 뷰어 다운

**대응**:
- 워커: 로컬 디스크에 큐잉 모드 (`worker/queue/`), 복구 시 자동 재적재
- 뷰어: Vercel은 정적 폴백 (전날 리포트 캐시)
- 발생 시간이 4시간 이상이면 사용 부서에 Slack 공지

### 2.3 Ollama / GPU 장애

**증상**: LLM 호출 timeout, GPU OOM

**대응**:
1. `docker compose restart ollama`
2. GPU 메모리 확인 (`nvidia-smi`), 다른 프로세스가 점유 중인지
3. 모델 재로딩 (`ollama pull qwen2.5:14b-instruct-q4_K_M`)
4. 영구 장애 시 → 분석 단계만 스킵, 수집·탐지·발송은 계속 (LLM 분석 없는 리포트도 가치 있음)

### 2.4 Snowflake 접근 실패

**증상**: 자사 데이터 매칭 단계에서 인증 오류

**대응**:
- DT파트(이슬비)에게 서비스 계정 확인 요청
- 매칭 단계만 스킵, 경쟁사 분석은 계속

### 2.5 Slack / Notion 발송 실패

**증상**: 리포트는 생성됐는데 발송 안 됨

**대응**:
- Webhook URL, Notion 토큰 유효성 점검
- 수동 발송: `docker compose exec worker python -m worker.main --task publish --date 2026-05-13 --channel slack`

## 3. 정기 점검 (주 1회 / 월 1회 / 분기 1회)

### 주 1회 (월요일)
- robots.txt 변경 점검
- 디스크 사용량 점검 (이미지 누적)
- 지난주 LLM 분석 평균 latency 확인

### 월 1회
- 경쟁브랜드 마스터 검토 (상품기획팀과 협의)
- 무신사 카테고리 트리 갱신 (신규 카테고리 추가)
- LLM 분석 무작위 20건 검수 (환각/편향)

### 분기 1회
- 거버넌스 감사 리포트 작성
- AX 위원회 정기 보고 자료 준비
- 모델 업그레이드 검토 (Qwen 신버전 등)

## 4. 데이터 정리

### 4.1 90일 경과 snapshot 정리 (Phase 3에서 자동화)
```sql
-- 월 1회 수동 (Phase 2 까지)
delete from product_snapshots
where snapshot_date < current_date - 90;
```

### 4.2 이미지 cold storage 이관 (Phase 3 자동화)
- 30일 경과 이미지를 별도 버킷으로 이동
- DB의 cdn_url 갱신

## 5. 비상 연락처

| 역할 | 담당 | 연락 |
|---|---|---|
| 시스템 오너 | 정호철 (IT팀장) | Slack DM |
| 인프라 1순위 | 김은호 | Slack DM |
| 인프라 2순위 | 정은상 | Slack DM |
| Snowflake | 이슬비 | Slack DM |
| 뷰어/UI | 이현우·도재연 | Slack DM |
| 법무 | (법무팀 컨택) | 메일 |

## 6. 사용 부서 FAQ

**Q. 매일 같은 시간에 리포트가 안 와요**
A. Slack #competitor-radar 채널 확인. 없으면 인프라파트 Slack DM.

**Q. 분석이 틀린 것 같아요**
A. 대시보드에서 해당 분석에 "피드백" 코멘트를 남겨주세요. LLM 프롬프트 개선에 반영합니다.

**Q. 특정 브랜드를 모니터링 대상에 추가하고 싶어요**
A. 상품기획팀장 → IT팀장 정호철에게 요청. 월 1회 일괄 반영.

**Q. 자사 다른 브랜드(리, 와키윌리)도 같은 리포트 받고 싶어요**
A. Phase 4 백로그에 있음. 우선순위 협의 필요.
