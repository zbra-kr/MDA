#!/usr/bin/env bash
# B.CAVE Competitor Radar — 상품 상세 수집 스크립트
# 사용: ./scripts/run_detail.sh [top_n]
# 예:   ./scripts/run_detail.sh 150   (기본값 150)
# 크론: 30 3 * * * /Users/macmini/projects/MDA/scripts/run_detail.sh

set -euo pipefail

REPO_DIR="/Users/macmini/projects/MDA"
PYTHON="$REPO_DIR/worker/.venv/bin/python3"
LOG_DIR="$REPO_DIR/logs"
LOG_FILE="$LOG_DIR/detail_$(date +%Y%m%d_%H%M).log"

mkdir -p "$LOG_DIR"

TOP=${1:-150}

echo "=== run_detail.sh start: $(date '+%Y-%m-%d %H:%M:%S %Z') top=$TOP ===" >> "$LOG_FILE"

cd "$REPO_DIR"

"$PYTHON" -m worker.main --mode detail --top "$TOP" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "=== run_detail.sh done: $(date '+%Y-%m-%d %H:%M:%S %Z') exit=$EXIT_CODE ===" >> "$LOG_FILE"

exit $EXIT_CODE
