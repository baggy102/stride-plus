// ESLint 9 flat config (CJS)
// 필수 패키지: pnpm add -Dw @typescript-eslint/parser @typescript-eslint/eslint-plugin @eslint/js
'use strict';

const path = require('node:path');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

// ─────────────────────────────────────────────
// Layer 정의 (낮은 숫자 = 더 근본적인 계층)
// 0: shared/types  1: shared  2: server/repo
// 3: server/service  4: server/controller  5: mobile
// ─────────────────────────────────────────────
function layerOf(fp) {
  const p = fp.replace(/\\/g, '/');
  if (/\/packages\/shared\/src\/types/.test(p))                              return { n: 0, label: 'shared/types' };
  if (/\/packages\/shared\/src\/utils/.test(p))                              return { n: 1, label: 'shared/utils' };
  if (/\/packages\/shared/.test(p))                                          return { n: 1, label: 'shared' };
  if (/\/apps\/server\/src\/.+\.(repo|repository)\.[tj]sx?$/.test(p))       return { n: 2, label: 'server/repo' };
  if (/\/apps\/server\/src\/.+\.service\.[tj]sx?$/.test(p))                 return { n: 3, label: 'server/service' };
  if (/\/apps\/server\/src\/.+\.controller\.[tj]sx?$/.test(p))              return { n: 4, label: 'server/controller' };
  if (/\/apps\/server/.test(p))                                              return { n: 3, label: 'server' };
  if (/\/apps\/mobile/.test(p))                                              return { n: 5, label: 'mobile' };
  return null;
}

const FIX_MESSAGES = {
  'shared->server':             '수정: shared 패키지는 server 코드에 의존할 수 없습니다. 공통 타입은 packages/shared/src/types/ 에 정의하세요.',
  'shared->mobile':             '수정: shared 패키지는 mobile 코드에 의존할 수 없습니다.',
  'server-repo->service':       '수정: Repository가 Service를 import하면 순환 의존이 됩니다. Service에서 Repository를 주입받는 구조로 바꾸세요.',
  'server-repo->controller':    '수정: Repository는 Controller를 import할 수 없습니다. Controller → Service → Repository 방향을 유지하세요.',
  'server-service->controller': '수정: Service는 Controller를 import할 수 없습니다. Controller에서 Service를 주입받으세요.',
  'mobile->server':             '수정: Mobile은 서버 코드를 직접 import할 수 없습니다. HTTP API(fetch/axios)를 사용하세요.',
};

function fixMessage(srcLayer, dstLayer) {
  if (srcLayer.n <= 1 && dstLayer.label.startsWith('server')) return FIX_MESSAGES['shared->server'];
  if (srcLayer.n <= 1 && dstLayer.label === 'mobile')          return FIX_MESSAGES['shared->mobile'];
  if (srcLayer.label === 'server/repo' && dstLayer.n === 3)    return FIX_MESSAGES['server-repo->service'];
  if (srcLayer.label === 'server/repo' && dstLayer.n === 4)    return FIX_MESSAGES['server-repo->controller'];
  if (srcLayer.label === 'server/service' && dstLayer.n === 4) return FIX_MESSAGES['server-service->controller'];
  if (srcLayer.label === 'mobile' && dstLayer.label.startsWith('server')) return FIX_MESSAGES['mobile->server'];
  return '수정: 의존성 방향을 확인하세요. shared/types → shared → server/repo → server/service → server/controller';
}

const noLayerViolationRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      violation:
        '[no-layer-violation] {{ src }} → {{ dst }} 역방향 import 금지.\n{{ fix }}',
    },
  },
  create(context) {
    const filename = context.physicalFilename ?? context.filename ?? (context.getPhysicalFilename ?? context.getFilename)?.();
    const srcLayer = layerOf(filename);
    if (!srcLayer) return {};

    function check(node, importPath) {
      if (!importPath) return;

      let resolvedPath = importPath;
      if (importPath.startsWith('.')) {
        resolvedPath = path.resolve(path.dirname(filename), importPath);
      }

      const dstLayer = layerOf(resolvedPath);
      if (!dstLayer) return;

      // mobile(5)은 server(2-4) import 금지
      const mobileImportsServer =
        srcLayer.label === 'mobile' && dstLayer.n >= 2 && dstLayer.n <= 4 && dstLayer.label.startsWith('server');

      // shared(0-1)은 server/mobile import 금지
      const sharedImportsHigher =
        srcLayer.n <= 1 && dstLayer.n >= 2;

      // server 계층 역방향 (repo→service, repo→controller, service→controller)
      const serverReverse =
        srcLayer.label.startsWith('server') &&
        dstLayer.label.startsWith('server') &&
        dstLayer.n > srcLayer.n;

      if (mobileImportsServer || sharedImportsHigher || serverReverse) {
        context.report({
          node,
          messageId: 'violation',
          data: {
            src: srcLayer.label,
            dst: dstLayer.label,
            fix: fixMessage(srcLayer, dstLayer),
          },
        });
      }
    }

    return {
      ImportDeclaration(node) { check(node, node.source.value); },
      'CallExpression[callee.name="require"]'(node) {
        const arg = node.arguments[0];
        if (arg?.type === 'Literal') check(node, arg.value);
      },
    };
  },
};

const localPlugin = {
  meta: { name: 'local' },
  rules: { 'no-layer-violation': noLayerViolationRule },
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/.next/**',
      'eslint.config.js',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser },
    plugins: {
      '@typescript-eslint': tsPlugin,
      local: localPlugin,
    },
    rules: {
      // ── 계층 의존성 (핵심 게이트) ──────────────────
      'local/no-layer-violation': 'error',

      // ── 타입 안전성 ──────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // ── 금지 패턴 ────────────────────────────────
      'no-console': 'error',           // console.log → Logger 사용
      'no-process-env': 'error',       // process.env → @nestjs/config 사용
    },
  },
];
