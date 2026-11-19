// 지도 피드 D3 바탕(2026-11-19 확정): 칸마다 지난 「서로 다른 러너 수」. 같은 사람이 여러 번 지나도 1명.
// 개인 위치 보호 하한(3명) 미만인 칸은 돌려주지 않는다. 칸은 위도·경도 격자(한 변 cellMeters, 기준 위도 lat0에서 정사각)
export const MIN_RUNNERS = 3;

const METERS_PER_DEG_LAT = 111320;

export interface DensityCell {
  lng: number;
  lat: number;
  n: number;
}

export function densityCells(
  runs: { userId: string; route: [number, number][] }[],
  cellMeters: number,
  lat0: number,
  minRunners = MIN_RUNNERS,
): DensityCell[] {
  const dLat = cellMeters / METERS_PER_DEG_LAT;
  const dLng = cellMeters / (METERS_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180));
  const runners = new Map<string, Set<string>>();
  const visit = (lng: number, lat: number, userId: string) => {
    const key = `${Math.floor(lng / dLng)},${Math.floor(lat / dLat)}`;
    let set = runners.get(key);
    if (!set) { set = new Set(); runners.set(key, set); }
    set.add(userId);
  };
  for (const { userId, route } of runs) {
    if (route.length === 1) visit(route[0][0], route[0][1], userId);
    for (let i = 1; i < route.length; i++) {
      const [a, b] = [route[i - 1], route[i]];
      // 칸 반 변보다 긴 구간은 나눠 찍어 칸을 건너뛰지 않는다
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]) / dLng, Math.abs(b[1] - a[1]) / dLat) * 2));
      for (let s = 0; s <= steps; s++) visit(a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps, userId);
    }
  }
  const cells: DensityCell[] = [];
  runners.forEach((set, key) => {
    if (set.size < minRunners) return;
    const [i, j] = key.split(',').map(Number);
    cells.push({ lng: (i + 0.5) * dLng, lat: (j + 0.5) * dLat, n: set.size });
  });
  return cells;
}
