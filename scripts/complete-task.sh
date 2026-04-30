#!/bin/bash
# 사용법: bash scripts/complete-task.sh <task-id>
# 태스크 완료 처리 — EXEC_PLAN에 완료 시각 기록

set -euo pipefail

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
  echo "사용법: bash scripts/complete-task.sh <task-id>"
  echo ""
  echo "task-id 목록 확인: ls .tasks/"
  exit 1
fi

PLAN_FILE=".tasks/${TASK_ID}/EXEC_PLAN.md"

if [ ! -f "$PLAN_FILE" ]; then
  echo "[ERROR] EXEC_PLAN 파일을 찾을 수 없습니다: ${PLAN_FILE}"
  echo "  task-id 목록: $(ls .tasks/ 2>/dev/null | tr '\n' ' ')"
  exit 1
fi

NOW=$(date '+%Y-%m-%d %H:%M:%S')

# macOS/Linux 모두 호환되는 sed
sed -i.bak "s/완료: -/완료: ${NOW}/" "$PLAN_FILE" && rm -f "${PLAN_FILE}.bak"

echo ""
echo "[DONE] ${TASK_ID} 완료 처리됨"
echo "  완료 시각: ${NOW}"
echo "  계획 파일: ${PLAN_FILE}"
