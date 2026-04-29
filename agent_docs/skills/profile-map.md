# Skill: Profile Map Screen

## Purpose
개인 프로필 지도 화면 규칙을 담는다.
내 기록 열람(`(tabs)/profile`)과 타 유저 열람(`user/[id]`) 양쪽에 적용.

## UI 구성
```
상단: 프로필 정보 (아바타, 닉네임, 총 거리, 총 런 횟수)
하단: 전체화면 MapView
  └─ 해당 유저의 모든 Run 경로를 Polyline으로 오버레이
  └─ 각 Run의 시작점에 빨간 점 마커
       └─ 탭 → RunCard 바텀시트
```

## Data fetch
```ts
// user/[id] 진입 시
GET /users/:id          // 프로필 정보
GET /runs?userId=:id    // 해당 유저의 전체 Run (route 포함)
```

## Rules
- 내 프로필(`(tabs)/profile`)과 타 유저(`user/[id]`)는 동일한 `ProfileMapScreen` 컴포넌트 재사용
- `userId` prop으로 분기 (없으면 로그인 유저 본인)
- Run 경로 Polyline 색상: `#E53935` opacity 0.6
- 전체 Run 경로가 화면에 들어오도록 `fitToCoordinates` 자동 호출
- Run 50개 초과 시 페이지네이션 (`?page=&limit=50`)
