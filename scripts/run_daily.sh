#!/usr/bin/env bash
# B.CAVE Competitor Radar — 일일 수집 크론 스크립트
# 사용: ./scripts/run_daily.sh
# 크론: 0 3 * * * /Users/macmini/projects/MDA/scripts/run_daily.sh

set -euo pipefail

REPO_DIR="/Users/macmini/projects/MDA"
PYTHON="$REPO_DIR/worker/.venv/bin/python3"
LOG_DIR="$REPO_DIR/logs"
LOG_FILE="$LOG_DIR/cron_$(date +%Y%m%d).log"

mkdir -p "$LOG_DIR"

echo "=== run_daily.sh start: $(date '+%Y-%m-%d %H:%M:%S %Z') ===" >> "$LOG_FILE"

# .env 는 worker/main.py 내 _load_env() 가 직접 파싱한다.
# (bash source는 괄호 등 특수문자가 있는 값에서 오류 발생)

cd "$REPO_DIR"

"$PYTHON" -m worker.main --categories all >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "=== run_daily.sh done: $(date '+%Y-%m-%d %H:%M:%S %Z') exit=$EXIT_CODE ===" >> "$LOG_FILE"

exit $EXIT_CODE
