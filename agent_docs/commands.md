# Stride+ 서버 뼈대 — 명령 순서

Claude Code에게 순서대로 아래 프롬프트를 입력한다.
각 단계가 완료되고 오류가 없음을 확인한 뒤 다음으로 넘어갈 것.

---

## Step 1 — 모노레포 초기화
> 읽어야 할 스킬: `agent_docs/skills/monorepo-pnpm.md`

```
agent_docs/skills/monorepo-pnpm.md 를 읽고,
stride-plus 모노레포를 초기화해줘.
pnpm-workspace.yaml, 루트 package.json,
apps/server(NestJS), packages/shared 디렉토리 구조를 만들어.
shared의 User, Run, Post 타입도 interface로 정의해.
```

---

## Step 2 — NestJS 모듈 스캐폴딩
> 읽어야 할 스킬: `agent_docs/skills/nestjs-scaffold.md`

```
agent_docs/skills/nestjs-scaffold.md 를 읽고,
apps/server 안에 auth / users / runs / posts / common 모듈을 생성해줘.
각 모듈은 module, controller, service, schema 4파일 세트로 만들어.
main.ts에 ValidationPipe 전역 등록과 포트 설정도 포함해.
```

---

## Step 3 — MongoDB 스키마 + 인덱스
> 읽어야 할 스킬: `agent_docs/skills/mongodb-schema.md`

```
agent_docs/skills/mongodb-schema.md 를 읽고,
User, Run, Post Mongoose 스키마를 각 도메인 폴더에 작성해줘.
Run 스키마에 2dsphere 인덱스와 userId+createdAt 복합 인덱스를 반드시 추가해.
@nestjs/mongoose로 app.module.ts에 MongoDB 연결도 설정해.
```

---

## Step 4 — JWT 인증
> 읽어야 할 스킬: `agent_docs/skills/jwt-auth.md`

```
agent_docs/skills/jwt-auth.md 를 읽고,
auth 모듈에 회원가입, 로그인, 토큰 재발급 API를 구현해줘.
JwtAuthGuard를 전역 등록하고 공개 라우트는 @Public() 데코레이터로 처리해.
비밀번호는 bcrypt salt 10, JWT secret은 환경변수에서만 참조해.
```

---

## Step 5 — 지도 반경 쿼리 API
> 읽어야 할 스킬: `agent_docs/skills/geo-api.md`

```
agent_docs/skills/geo-api.md 를 읽고,
GET /runs?lat&lng&radius 엔드포인트를 runs 모듈에 구현해줘.
$near 쿼리로 반경 내 Run을 조회하고, 마커용 경량 응답만 반환해.
route 전체 좌표는 GET /runs/:id 에서만 반환하도록 분리해.
```

---

## Step 6 — 동작 확인
> 스킬 불필요

```
지금까지 만든 서버를 pnpm --filter @stride/server dev 로 실행하고,
Swagger UI (localhost:3000/api)에서 아래 흐름이 동작하는지 확인해줘.
1. POST /auth/register
2. POST /auth/login → AccessToken 발급 확인
3. GET /runs?lat=37.5&lng=127.0&radius=3000 → 빈 배열 응답 확인
오류가 있으면 수정해.
```
