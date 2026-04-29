# Skill: Monorepo + pnpm

## Purpose
stride-plus 모노레포의 초기 세팅 규칙을 담는다.

## Structure
```
stride-plus/
├── apps/
│   ├── mobile/          # Expo
│   └── server/          # NestJS
├── packages/
│   └── shared/          # 공통 타입
├── pnpm-workspace.yaml
├── package.json         # 루트 (private: true)
└── CLAUDE.md
```

## pnpm-workspace.yaml
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

## Shared package rules
- `packages/shared/src/types/` 하위에 `user.ts`, `run.ts`, `post.ts` 분리
- 각 타입은 `interface`로 정의 (class 금지 — 서버/앱 양쪽 순수 타입만)
- `packages/shared/package.json` name: `@stride/shared`
- 서버에서 import: `import { RunType } from '@stride/shared'`

## Rules
- 루트 `package.json`은 `private: true`, 직접 의존성 없음
- 공통 스크립트: `pnpm --filter @stride/server dev`, `pnpm --filter @stride/mobile start`
- node_modules 호이스팅: 기본값 사용 (`.npmrc` 수정 금지)
