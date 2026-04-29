export interface GeoLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface Run {
  _id: string;
  userId: string;
  route: GeoLineString;
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm: number;
  startedAt: Date;
  finishedAt: Date;
  createdAt: Date;
}
