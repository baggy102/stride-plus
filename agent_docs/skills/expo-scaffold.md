# Skill: Expo Scaffold

## Purpose
Stride+ 모바일 앱의 초기 구조와 네비게이션 뼈대를 잡는다.

## Structure
```
apps/mobile/
├── app/                        # Expo Router (파일 기반 라우팅)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx         # 탭 네비게이터
│   │   ├── feed.tsx            # 지도 피드 (메인)
│   │   ├── record.tsx          # 러닝 기록
│   │   └── profile.tsx         # 내 프로필
│   ├── run/[id].tsx            # 러닝 상세
│   ├── user/[id].tsx           # 타 유저 프로필 지도
│   └── _layout.tsx             # 루트 레이아웃 (인증 분기)
├── src/
│   ├── api/                    # axios 인스턴스 + 엔드포인트
│   ├── store/                  # Zustand 전역 상태
│   ├── hooks/                  # 커스텀 훅
│   └── components/             # 공통 컴포넌트
├── app.json
└── .env.local                  # API_URL=http://localhost:3000
```

## Rules
- 라우터: Expo Router v3 (파일 기반). React Navigation 직접 사용 금지
- 상태관리: Zustand. Redux 사용 금지
- API 호출: `src/api/client.ts` axios 인스턴스 하나로 통일
- 토큰: `expo-secure-store`에 저장. AsyncStorage 사용 금지
- 스타일: NativeWind (TailwindCSS). StyleSheet 직접 작성 금지
