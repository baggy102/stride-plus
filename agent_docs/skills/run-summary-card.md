# Skill: Run Summary Card

## Purpose
러닝 종료 후 자동으로 표시되는 요약 카드 UI와 저장 흐름 규칙을 담는다.

## UI 구성
```
┌─────────────────────────────┐
│  러닝 코스 미니맵 (경로 표시)  │
│  거리: 5.2km  페이스: 5'30"  │
│  시간: 28분 32초              │
├─────────────────────────────┤
│  사진 추가 (선택)              │
│  한 줄 설명 입력 (선택)        │
├─────────────────────────────┤
│  [저장하기]    [취소]         │
└─────────────────────────────┘
```

## Save flow
```
[저장하기]
  └─ POST /runs  (route, distanceKm, paceSecPerKm, photoUrls, description)
  └─ 응답 runId로 POST /posts  (runId)
  └─ 모달 닫기 → (tabs)/feed 이동
```

## Components
- `RunSummaryModal` — 전체 모달 컨테이너
- `MiniMap` — 경로만 표시하는 경량 지도 (react-native-maps MapView + Polyline)
- `StatBadge` — 거리·페이스·시간 배지
- `PhotoPicker` — `expo-image-picker`로 갤러리 선택

## Rules
- 사진·설명은 선택값. 비어있어도 저장 가능
- 사진은 최대 3장. `expo-image-picker`로 선택 후 multipart/form-data로 서버 전송
- 저장 중 로딩 상태에서 [저장하기] 버튼 비활성화 (중복 제출 방지)
- 취소 시 runStore.resetRun() 호출
