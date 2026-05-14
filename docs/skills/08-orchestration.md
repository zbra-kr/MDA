# Skill 08: Orchestration (n8n + Docker)

> 매일 새벽 자동 실행되는 파이프라인. n8n이 스케줄러·재시도·알림·모니터링을 담당.

## 1. 디렉토리

```
n8n/
└── workflows/
    ├── daily_pipeline.json          매일 03:00 시작 마스터 워크플로우
    ├── scrape_category.json         카테고리 1개 스크래핑 서브플로우
    ├── analyze_anomalies.json       분석 단계 서브플로우
    └── publish_report.json          발송 단계 서브플로우
```

## 2. 왜 n8n인가

대안 (Airflow, Prefect, Dagster) 대비:
- 로코드 UI → 비개발자(MD팀 등)가 흐름 이해 가능
- HTTP/Webhook/스케줄 노드가 풍부 → Python 워커를 외부 도구로 호출
- Self-hosted (라이센스 무료)
- B.CAVE 환경에 Docker로 쉽게 배포

단점:
- 워크플로우 코드화(Git diff)가 Airflow보다 약함 → JSON export로 보완
- 대용량 데이터 처리는 부적합 → 본 시스템은 워커가 처리, n8n은 트리거만

## 3. 마스터 워크플로우 (`daily_pipeline.json`)

### 3.1 단계

```
[Cron: 매일 03:00 KST]
   ↓
[Init: report_date = 오늘]
   ↓
[병렬 Fan-out: 카테고리 N개]
   │  ├─ Execute Workflow: scrape_category (카테고리 001)
   │  ├─ Execute Workflow: scrape_category (카테고리 002)
   │  ├─ ...
   ↓ (모두 완료 대기)
[HTTP: worker /detect?date=...]
   ↓
[HTTP: worker /match-and-snowflake?date=...]
   ↓
[HTTP: worker /analyze?date=...]
   ↓
[HTTP: worker /publish?date=...]
   ↓
[Slack: 완료 알림 #it-radar-ops]
```

### 3.2 워커 호출 방식

Python 워커는 Flask/FastAPI 같은 HTTP 서버를 띄우거나, n8n의 "Execute Command" 노드로 `docker exec` 호출.

**권장: HTTP 서버 모드**
```python
# worker/api.py (간단 FastAPI)
from fastapi import FastAPI
from datetime import date

app = FastAPI()

@app.post("/scrape/ranking")
async def scrape_ranking(category: str):
    from worker.main import scrape_and_ingest_ranking
    await scrape_and_ingest_ranking(category)
    return {"ok": True}

@app.post("/detect")
def detect(d: date):
    from worker.main import run_detection
    run_detection(d)
    return {"ok": True}

# ... 나머지 단계
```

n8n에서는 HTTP Request 노드로 `http://worker:8000/detect` POST.

## 4. 카테고리 스크래핑 서브플로우 (`scrape_category.json`)

```
[Input: category_code]
   ↓
[HTTP: worker /scrape/ranking?category=...]  (이게 ranking + product detail까지)
   ↓
[Wait 30s]   ← rate limit 안전 마진
   ↓
[HTTP: worker /scrape/reviews?category=...]  (신규 상품 리뷰)
   ↓
[Output: stats]
```

병렬 실행 시 카테고리 간 충돌 안 나도록, 워커 내부에서도 글로벌 세마포어로 동시 페이지 1개 제한.

## 5. 분석 서브플로우 (`analyze_anomalies.json`)

```
[Input: date]
   ↓
[HTTP: worker /detect?date=...]
   ↓
[HTTP: worker /match?date=...]
   ↓
[HTTP: worker /analyze?date=...&top_k=50]   ← LLM 호출, 가장 오래 걸림
   ↓
[Slack alert if duration > 30분]
```

## 6. 에러 처리

각 HTTP 노드에 다음 설정:
- Retry: 3회, 지수 백오프 (60s, 180s, 540s)
- Continue on Fail: false (전체 중단)
- Error Workflow: 별도 `on_error.json` 호출

`on_error.json`:
```
[Slack: #it-radar-ops 채널에 에러 메시지]
[Email: IT팀장 정호철]
[Mark daily_reports.status = 'failed']
```

## 7. Docker Compose (`docker-compose.yml`)

루트 README에 풀 버전 있지만 핵심:

```yaml
services:
  worker:
    build: ./worker
    env_file: .env
    volumes:
      - ./worker/logs:/app/logs
    depends_on: [ollama]
    networks: [radar]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
    networks: [radar]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  n8n:
    image: n8nio/n8n:latest
    ports: ["5678:5678"]
    env_file: .env
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - GENERIC_TIMEZONE=Asia/Seoul
      - TZ=Asia/Seoul
    volumes:
      - n8n_data:/home/node/.n8n
      - ./n8n/workflows:/workflows:ro
    depends_on: [worker]
    networks: [radar]

volumes:
  ollama_data:
  n8n_data:

networks:
  radar:
    driver: bridge
```

## 8. 워커 컨테이너에서 Playwright 실행

Dockerfile (`worker/Dockerfile`):
```dockerfile
FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY . .
RUN playwright install --with-deps chromium

EXPOSE 8000
CMD ["uvicorn", "worker.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 9. n8n 워크플로우 Git 관리

n8n UI에서 만든 워크플로우는 JSON으로 export → `n8n/workflows/`에 커밋.

배포 시:
```bash
# n8n 컨테이너에 import
docker compose exec n8n n8n import:workflow --separate --input=/workflows
```

이걸 자동화하려면 n8n의 SOURCE_CONTROL 기능 사용 (Enterprise 기능, 우리는 수동 export로 충분).

## 10. 모니터링

- n8n 자체 UI에서 실행 이력 확인
- 매일 완료 후 Slack #it-radar-ops에 한 줄 요약 발송
- 주 1회 IT팀장에게 운영 요약 (성공률, 평균 소요, 에러 분포)

## 11. 비상 정지 절차

```bash
# 워크플로우만 정지 (데이터 보존)
docker compose exec n8n n8n update:workflow --id=<id> --active=false

# 전체 정지
docker compose stop n8n worker

# 완전 정지 (재기동 방지)
docker compose down
```

## 12. 시간대 주의

- n8n cron은 컨테이너 TZ 기준. `TZ=Asia/Seoul`, `GENERIC_TIMEZONE=Asia/Seoul` 둘 다 설정.
- 워커 Python도 `TZ=Asia/Seoul` 환경변수 + 코드에서 `zoneinfo.ZoneInfo("Asia/Seoul")` 사용.

## 13. 자원 사용량 추정

| 항목 | 추정 |
|---|---|
| 스크래핑 (전 카테고리) | 약 60~90분 |
| 적재·임베딩 | 약 20분 |
| 탐지 | < 5분 |
| 매칭·Snowflake | < 10분 |
| LLM 분석 (Top 50) | 10~15분 |
| 발송 | < 3분 |
| **총** | **약 120~150분** (03:00~05:30 완료) |

## 14. 단위 테스트
- 워크플로우 JSON은 스키마 검증 (n8n CLI)
- 워커 API 엔드포인트는 FastAPI TestClient
- 전체 E2E는 Phase 2에 추가 (스테이징 환경 별도 띄워서)
