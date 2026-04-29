# Skill: Map Feed Screen

## Purpose
메인 화면인 전체화면 지도 피드와 클러스터 마커 규칙을 담는다.

## Libraries
- `react-native-maps` — MapView
- `react-native-maps-clustering` — 자동 클러스터링

## UI 구성
```
전체화면 MapView
  └─ 현재 위치 반경 내 Run 마커 표시
       ├─ zoom 축소: 클러스터 마커 (빨간 원 + "+N" 텍스트)
       └─ zoom 확대: 개별 빨간 점 마커
            └─ 탭 → RunCard 바텀시트 (프로필 + 코스 요약)
                  └─ 프로필 탭 → user/[id] (개인 지도 화면)
```

## Data fetch
```ts
// 지도 이동/줌 변경 시 호출
const fetchMarkers = async (region: Region) => {
  const { latitude, longitude, latitudeDelta } = region;
  const radius = latitudeDeltaToMeters(latitudeDelta); // 화면 반경 계산
  return api.get(`/runs?lat=${latitude}&lng=${longitude}&radius=${radius}`);
};
```

## RunCard (바텀시트)
```
┌──────────────────────────┐
│ [프로필 이미지]  닉네임    │  ← 탭 시 user/[id]
│ 코스 썸네일 이미지         │
│ 거리 · 페이스 · 날짜       │
└──────────────────────────┘
```

## Rules
- 지도 초기 위치: `expo-location`으로 현재 위치 (권한 없으면 서울 기본값)
- 클러스터 반경: `radius={40}` (픽셀 단위)
- 마커 색상: 빨간색 `#E53935` 고정
- 지도 이동 완료(`onRegionChangeComplete`) 시에만 API 호출 (드래그 중 금지)
- RunCard는 `@gorhom/bottom-sheet` 사용
