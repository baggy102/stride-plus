#!/bin/bash
# 사용법: bash scripts/start-task.sh <task-name> <type>
# type: feature | fix | refactor

set -euo pipefail

TASK_NAME="${1:-}"
TYPE="${2:-}"

if [ -z "$TASK_NAME" ] || [ -z "$TYPE" ]; then
  echo "사용법: bash scripts/start-task.sh <task-name> <type>"
  echo "  type: feature | fix | refactor"
  echo ""
  echo "예시: bash scripts/start-task.sh geo-radius-query feature"
  exit 1
fi

if [[ "$TYPE" != "feature" && "$TYPE" != "fix" && "$TYPE" != "refactor" ]]; then
  echo "[ERROR] type은 feature, fix, refactor 중 하나여야 합니다. 입력값: '$TYPE'"
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d-%H%M")
TASK_ID="${TYPE}-${TASK_NAME}-${TIMESTAMP}"
TASK_DIR=".tasks/${TASK_ID}"
NOW=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$TASK_DIR"

cat > "${TASK_DIR}/EXEC_PLAN.md" << PLAN
# EXEC_PLAN — ${TASK_ID}

## 목표
(여기에 작성)

## 접근법
(여기에 작성)

## 단계별 계획
- [ ] 1.
- [ ] 2.
- [ ] 3.

## 완료 기준
- [ ] pnpm -r typecheck 통과
- [ ] pnpm -r lint 통과
- [ ] pnpm -r test --coverage 통과 (60% 이상)
- [ ] scripts/verify-task.sh 통과

## 상태
시작: ${NOW}
완료: -
PLAN

echo ""
echo "[START] 태스크 생성 완료"
echo "  task-id : ${TASK_ID}"
echo "  계획 파일: ${TASK_DIR}/EXEC_PLAN.md"
echo ""
echo "  다음 단계:"
echo "  1. ${TASK_DIR}/EXEC_PLAN.md 를 열어 목표와 계획을 작성한다"
echo "  2. agent_docs/skills/<관련 스킬>.md 를 읽는다"
echo "  3. 테스트 먼저 작성하고, 코드를 구현한다"
echo "  4. bash scripts/verify-task.sh 로 검증한다"
echo "  5. 커밋 후: bash scripts/complete-task.sh ${TASK_ID}"
