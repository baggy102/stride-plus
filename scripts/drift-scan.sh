#!/bin/bash
# 기술 부채 스캐너
# 로컬 실행: bash scripts/drift-scan.sh
# CI 스캔만:  bash scripts/drift-scan.sh
# Issue 생성: CREATE_ISSUES=true bash scripts/drift-scan.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

FOUND=0
CREATE_ISSUES="${CREATE_ISSUES:-false}"

scan_pattern() {
  local title="$1"
  local pattern="$2"
  local target="$3"
  local extra_excludes="${4:-}"

  MATCHES=$(grep -rn "$pattern" "$target" \
    --include="*.ts" --include="*.tsx" \
    --exclude="*.spec.ts" --exclude="*.spec.tsx" \
    --exclude="*.test.ts" --exclude="*.test.tsx" \
    --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.expo \
    $extra_excludes \
    2>/dev/null || true)

  if [ -z "$MATCHES" ]; then
    echo "  ✓ 위반 없음: ${title}"
    return 0
  fi

  FOUND=1
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  [DRIFT] ${title}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$MATCHES"

  if [ "$CREATE_ISSUES" = "true" ] && \
     [ -n "${GITHUB_TOKEN:-}" ] && \
     [ -n "${GITHUB_REPOSITORY:-}" ]; then

    BODY="$(printf '## 감지된 패턴\n**%s**\n\n```\n%s\n```\n\n_자동 생성: drift-scan.sh (%s)_' \
      "$title" "$MATCHES" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')")"

    gh issue create \
      --title "${title}" \
      --body "$BODY" \
      --label "drift" \
      2>/dev/null \
      && echo "  → GitHub Issue 생성 완료" \
      || echo "  → [주의] Issue 생성 실패 (레이블 'drift' 존재 여부 확인)"
  fi
}

echo ""
echo "=== Stride+ Drift Scanner ==="
echo ""

# ── 1. process.env 직접 참조 ─────────────────────────────────────────────────
scan_pattern \
  "[drift] process.env 직접 참조 발견" \
  "process\.env\.\w" \
  "apps/server/src"

# ── 2. AsyncStorage 사용 ──────────────────────────────────────────────────────
scan_pattern \
  "[drift] AsyncStorage 사용 발견" \
  "AsyncStorage" \
  "apps/mobile"

# ── 3. GeoJSON [lat, lng] 순서 위반 ─────────────────────────────────────────
scan_pattern \
  "[drift] GeoJSON 좌표 순서 위반 발견" \
  "\[lat" \
  "apps"

# ── 4. console.log 잔존 ───────────────────────────────────────────────────────
scan_pattern \
  "[drift] console.log 프로덕션 잔존" \
  "console\.log\s*(" \
  "apps"

echo ""
if [ "$FOUND" -eq 0 ]; then
  echo "[CLEAN] 드리프트 없음"
  exit 0
else
  echo "[DRIFT] 위반 항목 발견. 위 목록을 확인하고 수정하라."
  exit 1
fi
