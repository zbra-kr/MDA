#!/usr/bin/env bash
# B.CAVE Competitor Radar — DART 자동 갱신 스크립트
# 사용: ./scripts/run_dart.sh <mode>
# 예:   ./scripts/run_dart.sh weekly-disclosures
#       ./scripts/run_dart.sh quarterly-financials
#       ./scripts/run_dart.sh quarterly-audit-financials
#
# cron (기존 무신사 cron 3개 아래에 추가):
#   # Phase 1.6 — DART 공시·재무 자동 갱신
#   0 6 * * 0          /Users/macmini/projects/MDA/scripts/run_dart.sh weekly-disclosures
#   0 7 1 1,4,7,10 *   /Users/macmini/projects/MDA/scripts/run_dart.sh quarterly-financials
#
#   # Phase 1.7 — 감사보고서 자동 갱신 (4월 1일만 의미)
#   0 8 1 4 *          /Users/macmini/projects/MDA/scripts/run_dart.sh quarterly-audit-financials

set -euo pipefail

REPO_DIR="/Users/macmini/projects/MDA"
PYTHON="$REPO_DIR/worker/.venv/bin/python3"
LOG_DIR="$REPO_DIR/logs"

MODE="${1:-}"

if [[ -z "$MODE" ]]; then
    echo "사용법: $0 <mode>" >&2
    echo "  mode: weekly-disclosures | quarterly-financials | quarterly-audit-financials" >&2
    exit 1
fi

LOG_FILE="$LOG_DIR/dart_$(date +%Y%m%d)_${MODE}.log"
mkdir -p "$LOG_DIR"

echo "=== run_dart.sh start: $(date '+%Y-%m-%d %H:%M:%S %Z') mode=$MODE ===" >> "$LOG_FILE"

cd "$REPO_DIR"

case "$MODE" in
    weekly-disclosures|quarterly-financials)
        "$PYTHON" -m worker.dart.main --mode "$MODE" >> "$LOG_FILE" 2>&1
        ;;
    quarterly-audit-financials)
        "$PYTHON" -m worker.dart.pdf_parsing.main \
            --mode bootstrap-audit-financials >> "$LOG_FILE" 2>&1
        ;;
    *)
        echo "[ERROR] 알 수 없는 mode: $MODE" >&2
        exit 1
        ;;
esac

EXIT_CODE=$?

echo "=== run_dart.sh done: $(date '+%Y-%m-%d %H:%M:%S %Z') exit=$EXIT_CODE ===" >> "$LOG_FILE"

exit $EXIT_CODE
