import type { LngLat } from './route';

// 두 점 사이 km(haversine). 노드 테스트가 이 파일만 불러도 되게 route.ts를 런타임에 가져오지 않는다
function haversineKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// 「처음 달린 길」 판정 칸(m). 이웃 칸(3×3)까지 지난 것으로 봐서 GPS가 옆으로 흔들린 같은 길은 처음으로 세지 않는다
const CELL_M = 30;
// 처음 달린 길이 이보다 짧으면 표시하지 않는다(GPS가 옆 골목을 스친 것까지 「처음」으로 세지 않게, 브랜딩 4차 K2)
export const FIRST_RUN_MIN_KM = 0.2;

const M_PER_DEG_LAT = 110540;

function cellKey([lng, lat]: LngLat, mPerDegLng: number): [number, number] {
  return [Math.floor((lng * mPerDegLng) / CELL_M), Math.floor((lat * M_PER_DEG_LAT) / CELL_M)];
}

// 선분을 칸 크기의 절반 간격으로 나눈 점들
function samples(a: LngLat, b: LngLat): LngLat[] {
  const n = Math.max(1, Math.ceil((haversineKm(a, b) * 1000) / (CELL_M / 2)));
  const out: LngLat[] = [];
  for (let q = 0; q <= n; q++) out.push([a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n]);
  return out;
}

/**
 * route의 구간(i → i+1)마다 이전 내 러닝들이 지난 적 없는 길인지(first)와, 그 구간들의 길이 합(km).
 * 구간 가운데 점의 칸과 이웃 칸 중 하나라도 이전에 지났으면 처음이 아니다.
 */
export function firstRunFlags(route: LngLat[], previous: LngLat[][]): { first: boolean[]; km: number } {
  if (route.length < 2) return { first: [], km: 0 };
  const lat0 = route[0][1];
  const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const seen = new Set<string>();
  for (const prev of previous) {
    for (let i = 1; i < prev.length; i++) {
      for (const p of samples(prev[i - 1], prev[i])) seen.add(cellKey(p, mPerDegLng).join(','));
    }
    if (prev.length === 1) seen.add(cellKey(prev[0], mPerDegLng).join(','));
  }
  const visited = ([x, y]: [number, number]) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (seen.has(`${x + dx},${y + dy}`)) return true;
    return false;
  };
  const first: boolean[] = [];
  let km = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const isFirst = !visited(cellKey([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], mPerDegLng));
    first.push(isFirst);
    if (isFirst) km += haversineKm(a, b);
  }
  return { first, km };
}

/** 가장 많이 나온 값(동률이면 먼저 나온 것). 빈 값은 세지 않는다 */
export function mostFrequent(names: (string | null | undefined)[]): string | null {
  const count = new Map<string, number>();
  let best: string | null = null;
  for (const name of names) {
    if (!name) continue;
    const n = (count.get(name) ?? 0) + 1;
    count.set(name, n);
    if (best === null || n > (count.get(best) ?? 0)) best = name;
  }
  return best;
}

/** 경로 위 고른 간격의 점 n개(양 끝 포함). 동네 이름을 구할 때 쓴다 */
export function evenPoints(route: LngLat[], n: number): LngLat[] {
  if (route.length === 0 || n <= 0) return [];
  if (route.length === 1 || n === 1) return [route[Math.floor(route.length / 2)]];
  return Array.from({ length: n }, (_, k) => route[Math.round((k * (route.length - 1)) / (n - 1))]);
}
