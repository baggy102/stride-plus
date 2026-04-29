# Skill: Geo API

## Purpose
지도 피드의 핵심인 반경 쿼리 엔드포인트 규칙을 담는다.

## Endpoint
```
GET /runs?lat=37.5&lng=127.0&radius=3000
```
- `radius` 단위: 미터 (기본값 5000, 최대 50000)
- 응답: 마커용 경량 데이터 (full route 제외)

## Query (Mongoose)
```ts
Run.find({
  route: {
    $near: {
      $geometry: { type: 'Point', coordinates: [lng, lat] },
      $maxDistance: radius,
    },
  },
}).select('userId distanceKm paceSecPerKm photoUrls createdAt');
```

## Response shape (마커용)
```ts
{
  _id: string;
  userId: { _id: string; profileImageUrl: string; };
  distanceKm: number;
  paceSecPerKm: number;
  thumbnailUrl: string;   // photoUrls[0] or null
  startPoint: [number, number]; // coordinates[0] of route
  createdAt: string;
}
```

## Rules
- `$near` 쿼리는 반드시 `2dsphere` 인덱스가 있어야 동작 — 인덱스 없으면 쿼리 오류
- route 전체 좌표는 이 엔드포인트에서 반환하지 않음 (트래픽 절감)
- 상세 route는 `GET /runs/:id`에서만 반환
