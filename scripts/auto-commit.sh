#!/bin/bash
# Claude Code Stop 훅에서 자동 호출
# 변경 사항 있을 때만 검증 → 통과 시 자동 커밋

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

# ── main 브랜치 직접 작업 금지 ─────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "  [AUTO-COMMIT 차단] main 브랜치 직접 커밋 금지"
  echo "  Sourcetree에서 feature 브랜치를 먼저 만드세요:"
  echo "  예) feat/auth-flow, fix/geo-index"
  echo "╚══════════════════════════════════════════════════════╝"
  exit 1
fi

# ── 변경 사항 없으면 건너뜀 ────────────────────────────────────────────────
UNSTAGED=$(git diff --name-only 2>/dev/null)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null)

if [ -z "$UNSTAGED" ] && [ -z "$UNTRACKED" ]; then
  exit 0
fi

echo ""
echo "=== Auto-Commit: 변경 감지 (브랜치: ${BRANCH}) ==="

# ── 검증 실행 ─────────────────────────────────────────────────────────────
echo ""
echo "→ 검증 시작 (scripts/verify-task.sh)"
if ! bash scripts/verify-task.sh; then
  echo ""
  echo "[AUTO-COMMIT 중단] 검증 실패. 위 에러를 수정 후 재시도합니다."
  exit 1
fi

# ── 커밋 메시지 자동 생성 ──────────────────────────────────────────────────
CHANGED=$(git diff --name-only; git ls-files --others --exclude-standard)
FILE_COUNT=$(echo "$CHANGED" | grep -c . || true)
FIRST_FILE=$(echo "$CHANGED" | head -1)
SCOPE=$(echo "$FIRST_FILE" | sed 's|apps/server/src/||; s|apps/mobile/||; s|packages/shared/||; s|/.*||')

TIMESTAMP=$(date '+%H:%M')
MSG="auto(${SCOPE}): ${FILE_COUNT}개 파일 변경 [${TIMESTAMP}]"

# ── 스테이징 및 커밋 ───────────────────────────────────────────────────────
git add -A
git commit -m "$MSG"

echo ""
echo "[AUTO-COMMIT 완료] ${MSG}"
echo "  브랜치: ${BRANCH}"
echo "  Sourcetree에서 변경 내역을 확인하세요."
