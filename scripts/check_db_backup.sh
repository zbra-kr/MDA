#!/usr/bin/env bash
# B.CAVE Competitor Radar — 마이그레이션 적용 전 DB 백업 확인 안내
#
# 사용: ./scripts/check_db_backup.sh [migration_number]
# 예:   ./scripts/check_db_backup.sh 00019
#
# 역할: 실제 백업을 실행하지 않는다 (Supabase 자동 백업 담당).
#       적용 전 정호철이 대시보드에서 최신 백업을 수동 확인하도록 안내.

set -euo pipefail

MIGRATION="${1:-}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  DB 백업 확인 체크리스트"
if [[ -n "$MIGRATION" ]]; then
    echo "  마이그레이션: $MIGRATION"
fi
echo "══════════════════════════════════════════════════════════"
echo ""
echo "  [1] Supabase 대시보드 → Database → Backups 에서 최신"
echo "      Point-in-Time Recovery (PITR) 또는 Daily Backup 확인."
echo ""
if [[ -n "$PROJECT_REF" ]]; then
    echo "  대시보드 바로가기:"
    echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/database/backups/scheduled"
    echo ""
fi
echo "  [2] 체크 항목:"
echo "      □ 최신 백업이 24시간 이내인가?"
echo "      □ DROP TABLE ... CASCADE 대상 테이블에 운영 데이터가 있는가?"
echo "        있다면: 백업 스냅샷 다운로드 후 진행."
echo "      □ 마이그레이션 파일 헤더의 ⚠️ 주석을 읽었는가?"
echo ""
echo "  [3] 확인 후 Supabase SQL Editor 에서 마이그레이션 실행."
echo ""
echo "  SUPABASE_PROJECT_REF 환경변수를 설정하면 대시보드 URL 이"
echo "  자동으로 출력됩니다:"
echo "    export SUPABASE_PROJECT_REF=<your-project-ref>"
echo ""
echo "══════════════════════════════════════════════════════════"
echo ""
