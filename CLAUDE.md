# CLAUDE.md — Stride+ AI 필수 규칙 (자동 로드)

## 절대 규칙: 모든 코드 작업 순서

**apps/, packages/ 코드 변경 시 아래 순서를 반드시 따른다.**

### 1. 브랜치 생성 (main 직접 커밋 금지)
```bash
git checkout -b <task-name>   # 예: feat/gps-tracker
```

### 2. EXEC_PLAN 생성
```bash
bash scripts/start-task.sh <task-name> <feature|fix|refactor>
```
계획 없이 코드 먼저 작성 금지. 목표·접근법·단계·완료 기준 채울 것.

### 3. 관련 문서 읽기
`agent_docs/skills/<스킬>.md` → `agent_docs/api.md` → `agent_docs/db.md`

### 4. 테스트 작성 (스킵 불가)
- 새 기능: 정상 + 엣지 케이스 / 버그: 재현 테스트 / 리팩터링: 동작 보존

### 5. 검증 (스킵 불가)
```bash
bash scripts/verify-task.sh   # 통과 후에만 커밋
```

### 6. 커밋 → Push → 완료
```bash
git commit -m "feat(scope): 설명"   # Conventional Commits
git push origin <branch-name>
# 머지 후:
bash scripts/complete-task.sh <task-id>
```

---

## 프로젝트 개요

러닝 트래킹 + 지도 SNS. 러닝 종료 시 자동 기록, 전체화면 지도 피드 공유.

```
stride-plus/
├── apps/mobile/      # Expo (React Native) — GPS·카메라 권한, EAS Build
├── apps/server/      # NestJS + MongoDB — 모듈/DI, 2dsphere 지도 쿼리
└── packages/shared/  # 공통 타입 (User, Run, Post)
```

---

## 핵심 도메인 규칙

- `Run.route` → GeoJSON `LineString`, `runs.schema.ts`에 `2dsphere` 인덱스 필수
- 지도 피드 → `GET /runs?lat&lng&radius` 반경 쿼리
- `Post` → `runId` FK 필수, Run 없이 생성 불가 (서비스 계층 검증)
- 인증 → JWT + Refresh Token, 토큰은 `.env.local` 전용
- GeoJSON 좌표 → `[lng, lat]` 순서 (lat·lng 혼동 주의)

**의존성 방향** (위반 시 ESLint `local/no-layer-violation` error):
```
shared/types → shared → server/repo → server/service → server/controller
                                                              ↑
                                                     mobile은 shared만 import
```

---

## 주요 파일 위치

| 도메인 | 위치 |
|--------|------|
| Auth | `server/src/auth/` (schema·service·controller·dto), `common/jwt.guard.ts` |
| Runs | `server/src/runs/` — 2dsphere 필수 |
| Posts | `server/src/posts/` — runId 검증 필수 |
| Mobile | `mobile/app/` (Expo Router v3), `mobile/src/store/`, `mobile/src/hooks/` |
| Shared | `packages/shared/src/types/`, `packages/shared/src/index.ts` |

추가 스펙: `agent_docs/api.md` · `agent_docs/mobile.md` · `agent_docs/db.md`
## 금지 목록

| 금지 | 대안 |
|------|------|
| `process.env.FOO` (서버) | `configService.get('FOO')` (@nestjs/config) |
| `AsyncStorage` | `expo-secure-store` SecureStore |
| `[lat, lng]` 좌표 순서 | `[lng, lat]` (GeoJSON 표준) |
| mobile에서 server 코드 직접 import | HTTP API(axios) 사용 |
| `.env.local` git 커밋 | 토큰 유출 위험 |
| `--no-verify` 커밋 훅 우회 | CI 게이트 무력화 금지 |
| ESLint rule을 `warn`으로 낮추기 | 항상 `error` 유지 |
## Agent 효율 수칙

- 이미 읽은 파일 재확인 금지
- 독립적 도구 호출은 병렬 실행 우선
- 20줄 이상 탐색은 서브에이전트 위임
- 사용자가 설명한 내용 반복 금지
