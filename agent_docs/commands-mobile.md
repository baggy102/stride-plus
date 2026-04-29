# Stride+ 모바일 앱 뼈대 — 명령 순서

서버 `commands.md` Step 6 완료 후 진행한다.
각 단계 완료 + 오류 없음 확인 후 다음으로 넘어갈 것.

---

## Step 1 — Expo 프로젝트 스캐폴딩
> 읽어야 할 스킬: `agent_docs/skills/expo-scaffold.md`

```
agent_docs/skills/expo-scaffold.md 를 읽고,
apps/mobile Expo 프로젝트를 초기화해줘.
Expo Router v3 파일 기반 라우팅 구조로 만들고,
(auth), (tabs), run/[id], user/[id] 라우트 파일을 모두 생성해.
NativeWind, Zustand, axios, expo-secure-store 의존성도 설치해.
```

---

## Step 2 — API 클라이언트 + 인증 플로우
> 읽어야 할 스킬: `agent_docs/skills/mobile-auth.md`

```
agent_docs/skills/mobile-auth.md 를 읽고,
src/api/client.ts axios 인스턴스를 만들어줘.
401 응답 시 자동 토큰 갱신 인터셉터 포함.
Zustand authStore (login, logout, refreshToken) 구현하고,
루트 _layout.tsx 에서 isAuthenticated 기반 라우트 분기도 연결해.
로그인·회원가입 화면 UI도 만들어.
```

---

## Step 3 — GPS 러닝 트래커
> 읽어야 할 스킬: `agent_docs/skills/gps-tracker.md`

```
agent_docs/skills/gps-tracker.md 를 읽고,
(tabs)/record.tsx 화면을 구현해줘.
expo-location + expo-task-manager 로 백그라운드 GPS 트래킹,
Zustand runStore (startTracking, stopTracking, resetRun) 구현,
useHaversine 훅으로 거리·페이스 실시간 계산,
app.json 위치 권한 설정까지 포함해.
```

---

## Step 4 — 러닝 종료 요약 카드
> 읽어야 할 스킬: `agent_docs/skills/run-summary-card.md`

```
agent_docs/skills/run-summary-card.md 를 읽고,
RunSummaryModal 컴포넌트를 만들어줘.
MiniMap(경로 표시), StatBadge(거리·페이스·시간),
PhotoPicker(최대 3장), 설명 입력 포함.
저장 시 POST /runs → POST /posts 순서로 호출하고,
완료 후 (tabs)/feed 로 이동해.
```

---

## Step 5 — 지도 피드 화면 (메인)
> 읽어야 할 스킬: `agent_docs/skills/map-feed.md`

```
agent_docs/skills/map-feed.md 를 읽고,
(tabs)/feed.tsx 전체화면 지도 피드를 구현해줘.
react-native-maps-clustering 으로 클러스터 마커,
onRegionChangeComplete 시 GET /runs?lat&lng&radius 호출,
마커 탭 시 @gorhom/bottom-sheet 로 RunCard 바텀시트 표시,
RunCard 프로필 탭 시 user/[id] 로 이동.
```

---

## Step 6 — 프로필 지도 화면
> 읽어야 할 스킬: `agent_docs/skills/profile-map.md`

```
agent_docs/skills/profile-map.md 를 읽고,
ProfileMapScreen 컴포넌트를 만들어줘.
(tabs)/profile.tsx 와 user/[id].tsx 양쪽에서 재사용할 수 있게,
userId prop으로 내 기록/타 유저 기록을 분기해.
모든 Run 경로를 Polyline으로 오버레이하고
fitToCoordinates 로 전체 경로가 화면에 맞게 자동 조정해.
```

---

## Step 7 — 서버 연동 통합 테스트
> 스킬 불필요

```
지금까지 만든 앱과 서버를 함께 실행하고 아래 흐름을 테스트해줘.
1. 회원가입 → 로그인 → 토큰 저장 확인
2. record 화면에서 GPS 트래킹 시작 → 종료 → 요약 카드 표시
3. 저장 → 서버 DB에 Run, Post 생성 확인
4. feed 화면에서 방금 저장한 Run 마커가 지도에 표시되는지 확인
5. 마커 탭 → RunCard → 프로필 탭 → 프로필 지도에 경로 표시 확인
오류가 있으면 수정해.
```
