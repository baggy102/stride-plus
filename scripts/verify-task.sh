#!/bin/bash
# 커밋 전 전체 검증 스크립트
# pre-commit 훅 및 수동 실행: bash scripts/verify-task.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

STEP=0

step() {
  STEP=$((STEP + 1))
  echo ""
  echo "── [${STEP}/7] $1"
}

fail() {
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "  [FAIL] $1"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  exit 1
}

echo ""
echo "=== Stride+ 커밋 전 검증 ==="

# ── 1. 타입 체크 ─────────────────────────────────────────────────────────────
step "타입 체크 (tsc --noEmit)"
if ! pnpm -r typecheck 2>&1; then
  fail "타입 에러 수정 후 재시도. 로컬: pnpm --filter @stride/server exec tsc --noEmit"
fi

# ── 2. ESLint ────────────────────────────────────────────────────────────────
step "ESLint (no-layer-violation 포함)"
if ! pnpm exec eslint "apps/**/*.{ts,tsx}" "packages/**/*.ts" --max-warnings 0 2>&1; then
  fail "ESLint 에러 수정. 에러 메시지의 '수정:' 지시에 따라 의존성 방향 확인"
fi

# ── 3. 테스트 + 커버리지 ─────────────────────────────────────────────────────
step "Jest 테스트 + 커버리지 60% 확인"
if ! pnpm --filter @stride/server exec jest \
     --coverage \
     --coverageThreshold='{"global":{"lines":60,"functions":60,"branches":60,"statements":60}}' \
     2>&1; then
  fail "테스트 커버리지 60% 미달 또는 테스트 실패. 실패한 테스트를 먼저 수정하라"
fi

# ── 4. process.env 직접 참조 금지 ────────────────────────────────────────────
step "process.env 직접 참조 검사"
VIOLATIONS=$(grep -rn "process\.env\." apps/ packages/ \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.ts" --exclude="*.spec.tsx" --exclude="*.test.ts" \
  --exclude-dir=node_modules --exclude-dir=dist \
  2>/dev/null || true)
if [ -n "$VIOLATIONS" ]; then
  echo "$VIOLATIONS"
  fail "process.env 직접 참조 금지 → configService.get('KEY') 사용. AppModule에 ConfigModule.forRoot({ isGlobal: true }) 확인"
fi

# ── 5. AsyncStorage 사용 금지 ─────────────────────────────────────────────────
step "AsyncStorage 사용 검사"
VIOLATIONS=$(grep -rn "AsyncStorage" apps/mobile/ \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.*" --exclude="*.test.*" \
  --exclude-dir=node_modules \
  2>/dev/null || true)
if [ -n "$VIOLATIONS" ]; then
  echo "$VIOLATIONS"
  fail "AsyncStorage 금지 → expo-secure-store의 SecureStore.setItemAsync / getItemAsync 사용"
fi

# ── 6. console.log 프로덕션 잔존 ─────────────────────────────────────────────
step "console.log 프로덕션 코드 검사"
VIOLATIONS=$(grep -rn "console\.log\s*(" apps/ packages/ \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.spec.ts" --exclude="*.spec.tsx" --exclude="*.test.ts" --exclude="*.test.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist \
  2>/dev/null || true)
if [ -n "$VIOLATIONS" ]; then
  echo "$VIOLATIONS"
  fail "console.log 프로덕션 코드에서 제거. 서버: Logger(@nestjs/common) 사용. 모바일: __DEV__ 조건부 처리"
fi

# ── 7. GeoJSON 좌표 순서 검사 ─────────────────────────────────────────────────
step "GeoJSON [lat, lng] 순서 위반 검사"
VIOLATIONS=$(grep -rn "\[lat" apps/ packages/ \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist \
  2>/dev/null || true)
if [ -n "$VIOLATIONS" ]; then
  echo "$VIOLATIONS"
  fail "GeoJSON 좌표 순서 위반 → [lng, lat] 사용 (GeoJSON 표준: 경도 먼저)"
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "  [PASS] 모든 검증 통과. 커밋 가능."
echo "╚══════════════════════════════════════════════╝"
echo ""
