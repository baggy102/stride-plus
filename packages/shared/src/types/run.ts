export interface GeoLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface Run {
  _id: string;
  userId: string;
  route: GeoLineString;
  /** 경로 점마다 시작 후 흐른 시간(초, 일시정지 제외). 이전 기록은 빈 배열 */
  routeTimes: number[];
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm: number;
  startedAt: Date;
  finishedAt: Date;
  createdAt: Date;
}
