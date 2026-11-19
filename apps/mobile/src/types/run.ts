// 지도 피드 · 프로필 목록에서 받는 러닝(GET /runs 응답 한 개)
export interface RunMarker {
  _id: string;
  userId: { _id: string; username?: string; profileImageUrl?: string };
  distanceKm: number;
  paceSecPerKm: number;
  routeImageUrl: string | null;
  thumbnailUrl: string | null;
  photoUrls: string[];
  /** 코스 소개 — 목록·카드에서 코스 이름처럼 보여 준다 */
  description?: string;
  startPoint: [number, number] | null;
  createdAt: string;
}
