// 지도 피드 NEW(2026-11-21 사용자 결정: 칸 중심) — 「이번 주 새 길」 칸.
// 최근 windowMs(7일) 안에 지난 칸 중, 그 통과 직전 lookbackMs(28일) 동안 아무 러닝도 지나지 않았던 칸.
// 칸은 줌과 상관없는 고정 지리 격자(한 변 cellMeters, 기준 위도 REF_LAT — 국내 전용). D3 바탕(density.ts)의 화면 칸과 별개
export const NEW_CELL_METERS = 50;
export const NEW_WINDOW_MS = 7 * 24 * 3600 * 1000;
export const NEW_LOOKBACK_MS = 28 * 24 * 3600 * 1000;
const REF_LAT = 37.5;
const METERS_PER_DEG_LAT = 111320;
const EARTH_RADIUS_KM = 6371;

type LngLat = [number, number];

export interface NewCellRun {
  id: string;
  /** 러닝 시각(ms) */
  at: number;
  /** 출발·도착 100m를 자른 경로 */
  route: LngLat[];
}

export interface NewCellsResult {
  cellMeters: number;
  cells: { lng: number; lat: number; runId: string }[];
  /** 칸을 연 러닝마다 연 칸을 지나는 구간 길이 합(km) */
  runs: { runId: string; km: number }[];
}

function km([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function newCells(
  runs: NewCellRun[],
  now: number,
  { cellMeters = NEW_CELL_METERS, windowMs = NEW_WINDOW_MS, lookbackMs = NEW_LOOKBACK_MS } = {},
): NewCellsResult {
  const dLat = cellMeters / METERS_PER_DEG_LAT;
  const dLng = cellMeters / (METERS_PER_DEG_LAT * Math.cos((REF_LAT * Math.PI) / 180));
  const keyOf = (lng: number, lat: number) => `${Math.floor(lng / dLng)},${Math.floor(lat / dLat)}`;

  // 칸마다 지난 러닝(같은 러닝은 한 번)
  const visits = new Map<string, { at: number; id: string }[]>();
  for (const run of runs) {
    const seen = new Set<string>();
    const visit = (lng: number, lat: number) => {
      const key = keyOf(lng, lat);
      if (seen.has(key)) return;
      seen.add(key);
      let list = visits.get(key);
      if (!list) { list = []; visits.set(key, list); }
      list.push({ at: run.at, id: run.id });
    };
    const { route } = run;
    if (route.length === 1) visit(route[0][0], route[0][1]);
    for (let i = 1; i < route.length; i++) {
      const [a, b] = [route[i - 1], route[i]];
      // 칸 반 변보다 긴 구간은 나눠 찍어 칸을 건너뛰지 않는다
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]) / dLng, Math.abs(b[1] - a[1]) / dLat) * 2));
      for (let s = 0; s <= steps; s++) visit(a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps);
    }
  }

  // 칸을 연 러닝: 이번 주 통과 중, 직전 lookback 동안 다른 통과가 없었던 가장 이른 것
  const weekStart = now - windowMs;
  const opener = new Map<string, string>();
  visits.forEach((list, key) => {
    list.sort((a, b) => a.at - b.at);
    for (let k = 0; k < list.length; k++) {
      const v = list[k];
      if (v.at < weekStart || v.at > now) continue;
      const prev = k > 0 ? list[k - 1].at : -Infinity;
      if (prev < v.at - lookbackMs) { opener.set(key, v.id); break; }
    }
  });

  const cells: NewCellsResult['cells'] = [];
  opener.forEach((runId, key) => {
    const [i, j] = key.split(',').map(Number);
    cells.push({ lng: (i + 0.5) * dLng, lat: (j + 0.5) * dLat, runId });
  });

  // 연 러닝마다 연 칸을 지나는 구간 길이(구간 가운데 점의 칸으로 판정)
  const openedKm = new Map<string, number>();
  for (const run of runs) {
    for (let i = 1; i < run.route.length; i++) {
      const [a, b] = [run.route[i - 1], run.route[i]];
      if (opener.get(keyOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) !== run.id) continue;
      openedKm.set(run.id, (openedKm.get(run.id) ?? 0) + km(a, b));
    }
  }
  const openers = new Set(opener.values());
  return {
    cellMeters,
    cells,
    runs: [...openers].map((runId) => ({ runId, km: Math.round((openedKm.get(runId) ?? 0) * 100) / 100 })),
  };
}
