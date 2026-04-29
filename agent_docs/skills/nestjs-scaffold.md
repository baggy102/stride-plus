# Skill: NestJS Scaffold

## Purpose
Stride+ 서버의 초기 모듈 구조와 공통 설정을 잡는다.

## Module structure
```
apps/server/src/
├── app.module.ts          # 루트 모듈
├── main.ts                # 진입점 (포트, 글로벌 파이프)
├── auth/                  # JWT 인증
├── users/                 # 유저 도메인
├── runs/                  # 러닝 기록 도메인
├── posts/                 # SNS 피드 도메인
└── common/                # Guard, Interceptor, Pipe 공통
```

## Rules
- 각 도메인은 `module / controller / service / schema` 4파일 세트
- `main.ts`에 `ValidationPipe({ whitelist: true })` 전역 등록
- 환경변수는 `@nestjs/config`로만 접근. `process.env` 직접 참조 금지
- 포트는 `CONFIG.PORT` (기본 3000)
