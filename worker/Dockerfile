# Playwright official base — Python + Chromium 사전 설치
FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

WORKDIR /app

# 시스템 의존성 (Snowflake 커넥터, imagehash 등에 필요)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# 의존성 먼저 (Docker 캐시 활용)
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

# 코드
COPY . .

# Playwright 브라우저 (이미지에 이미 있지만 버전 일치 보장)
RUN playwright install --with-deps chromium

# 로그·큐 디렉토리
RUN mkdir -p /app/logs /app/queue

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Seoul

EXPOSE 8000

# FastAPI 서버 모드 (n8n이 HTTP로 호출)
CMD ["uvicorn", "worker.api:app", "--host", "0.0.0.0", "--port", "8000"]
