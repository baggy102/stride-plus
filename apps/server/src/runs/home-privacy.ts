// 집 근처 가림: 남이 보는 경로에서 출발·도착 근처를 잘라 집 위치가 드러나지 않게 한다(기본 100m)
export const HOME_TRIM_METERS = 100;

type Coordinate = [number, number];

const EARTH_RADIUS_METERS = 6371000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function distanceMeters([lng1, lat1]: Coordinate, [lng2, lat2]: Coordinate): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// 누적 거리 target(m) 지점: 선분 인덱스 i와 그 선분 안 비율 k
function locate(cumulative: number[], target: number): { i: number; k: number } {
  let i = 0;
  while (i < cumulative.length - 2 && cumulative[i + 1] < target) i++;
  const span = cumulative[i + 1] - cumulative[i];
  return { i, k: span > 0 ? (target - cumulative[i]) / span : 0 };
}

// times는 좌표와 길이가 같을 때만 같이 자른다(아니면 빈 배열 그대로)
export function trimHomeEnds(
  coordinates: Coordinate[],
  times: number[] = [],
  meters = HOME_TRIM_METERS,
): { coordinates: Coordinate[]; times: number[] } {
  const withTimes = times.length === coordinates.length;
  if (coordinates.length < 2) return { coordinates, times };
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceMeters(coordinates[i - 1], coordinates[i]));
  }
  const total = cumulative[cumulative.length - 1];
  const at = (target: number): { point: Coordinate; time: number; i: number } => {
    const { i, k } = locate(cumulative, target);
    const [a, b] = [coordinates[i], coordinates[i + 1]];
    return {
      point: [lerp(a[0], b[0], k), lerp(a[1], b[1], k)],
      time: withTimes ? lerp(times[i], times[i + 1], k) : 0,
      i,
    };
  };
  // 짧은 경로: 가운데 한 점만
  if (total <= meters * 2) {
    const middle = at(total / 2);
    return { coordinates: [middle.point], times: withTimes ? [middle.time] : [] };
  }
  const start = at(meters);
  const end = at(total - meters);
  return {
    coordinates: [start.point, ...coordinates.slice(start.i + 1, end.i + 1), end.point],
    times: withTimes ? [start.time, ...times.slice(start.i + 1, end.i + 1), end.time] : [],
  };
}
