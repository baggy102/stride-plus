# Skill: JWT Auth

## Purpose
Stride+ 서버의 인증·인가 흐름 규칙을 담는다.

## Flow
```
[POST /auth/register] → 비밀번호 bcrypt 해싱 → User 저장
[POST /auth/login]    → 비밀번호 검증 → AccessToken + RefreshToken 발급
[POST /auth/refresh]  → RefreshToken 검증 → AccessToken 재발급
```

## Token spec
| 항목 | AccessToken | RefreshToken |
|------|-------------|--------------|
| 만료 | 15분 | 7일 |
| 저장 | 클라이언트 메모리 | HttpOnly Cookie |
| 저장 위치(서버) | 없음 (stateless) | DB or Redis (선택) |

## Rules
- `JwtAuthGuard`를 전역 등록하고, 공개 라우트는 `@Public()` 데코레이터로 예외 처리
- 비밀번호는 `bcrypt`, salt rounds 10
- JWT secret은 `.env.local`의 `JWT_SECRET` 참조. 코드에 하드코딩 금지
- RefreshToken은 `@nestjs/jwt` 별도 secret(`JWT_REFRESH_SECRET`) 사용
