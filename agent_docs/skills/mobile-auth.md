# Skill: Mobile Auth Flow

## Purpose
앱의 로그인·회원가입·토큰 갱신 흐름 규칙을 담는다.

## Flow
```
앱 시작
  └─ SecureStore에 AccessToken 존재?
       ├─ YES → 유효성 확인 → (tabs)/feed
       └─ NO  → (auth)/login
```

## Token 관리
- AccessToken: `expo-secure-store` 키 `access_token`
- RefreshToken: `expo-secure-store` 키 `refresh_token`
- axios 인터셉터에서 401 응답 시 자동으로 `/auth/refresh` 호출 후 재시도

## Zustand store (auth)
```ts
interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}
```

## Rules
- 루트 `_layout.tsx`에서 `isAuthenticated` 기반으로 라우트 분기
- 로그아웃 시 SecureStore 전체 토큰 삭제 후 `(auth)/login`으로 리다이렉트
- API 에러는 `src/api/errors.ts`에서 중앙 처리. 각 화면에서 try/catch 금지
