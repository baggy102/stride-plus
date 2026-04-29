# Skill: GPS Running Tracker

## Purpose
백그라운드 GPS 트래킹과 러닝 종료 시 자동 요약 로직 규칙을 담는다.

## Libraries
- `expo-location` — GPS 좌표 수집
- `expo-task-manager` — 백그라운드 작업 등록

## Tracking flow
```
[시작 버튼]
  └─ TaskManager에 BACKGROUND_LOCATION_TASK 등록
  └─ 좌표 배열 실시간 누적 (Zustand runStore)

[종료 버튼]
  └─ TaskManager 태스크 해제
  └─ 좌표 배열 → GeoJSON LineString 변환
  └─ 거리(km) 계산 — Haversine 공식
  └─ 페이스(초/km) 계산 — 총 시간 / 총 거리
  └─ 요약 카드 모달 자동 표시
```

## GeoJSON 변환
```ts
const toLineString = (coords: [number, number][]) => ({
  type: 'LineString',
  coordinates: coords, // [lng, lat] 순서 (GeoJSON 표준)
});
```

## Zustand store (run)
```ts
interface RunStore {
  isTracking: boolean;
  coordinates: [number, number][];
  elapsedSeconds: number;
  startTracking: () => Promise<void>;
  stopTracking: () => RunSummary;
  resetRun: () => void;
}
```

## Rules
- 좌표는 반드시 `[lng, lat]` 순서 (GeoJSON 표준, lat/lng 혼동 주의)
- `app.json`에 `locationAlwaysAndWhenInUsePermission` 등록 필수
- 백그라운드 태스크 이름 상수: `BACKGROUND_LOCATION_TASK = 'bg-location'`
- 거리 계산은 `src/hooks/useHaversine.ts` 훅으로 분리
