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

// 점 center에서 경로(꺾은선, 점 하나여도 된다)까지 가장 가까운 거리(m). 빈 경로는 Infinity.
// center 둘레를 평면으로 펴서 잰다(지도 검색 반경 정도의 거리에서는 오차가 아주 작다). stopAt 이하를 찾으면 바로 돌려준다
export function distanceToRouteMeters([lng0, lat0]: Coordinate, route: Coordinate[], stopAt = 0): number {
  if (route.length === 0) return Infinity;
  const ky = toRadians(1) * EARTH_RADIUS_METERS;
  const kx = ky * Math.cos(toRadians(lat0));
  let ax = (route[0][0] - lng0) * kx;
  let ay = (route[0][1] - lat0) * ky;
  let best = Math.hypot(ax, ay);
  for (let i = 1; i < route.length && best > stopAt; i++) {
    const bx = (route[i][0] - lng0) * kx;
    const by = (route[i][1] - lat0) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // 선분 위에서 center(원점)에 가장 가까운 점
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    ax = bx;
    ay = by;
  }
  return best;
}

// 경로가 center에서 meters 안을 지나는가
export function routeWithinMeters(center: Coordinate, route: Coordinate[], meters: number): boolean {
  return distanceToRouteMeters(center, route, meters) <= meters;
}
