// 경로 계산 공통(기록 중·요약·상세). 좌표는 GeoJSON [lng, lat]
export type LngLat = [number, number];

// GPS 순간 튐 기준(store/run.ts의 필터와 같다): 이보다 빠른 구간은 스플릿 계산에서 뺀다
const MAX_SPEED_MPS = 10;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: LngLat, b: LngLat) {
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c = sinDLat * sinDLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

/** 1 km마다 경로 위 지점과 그 지점의 진행 방향(앞 점 → 뒤 점). 눈금 표시용 */
export interface KmMark {
  km: number;
  at: LngLat;
  from: LngLat;
  to: LngLat;
}

export function kmMarks(coords: LngLat[]): KmMark[] {
  const marks: KmMark[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = haversineKm(coords[i - 1], coords[i]);
    if (seg <= 0) continue;
    while (Math.floor(total + seg) > marks.length) {
      const km = marks.length + 1;
      const f = (km - total) / seg;
      const [a, b] = [coords[i - 1], coords[i]];
      marks.push({ km, at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], from: a, to: b });
    }
    total += seg;
  }
  return marks;
}

/**
 * km별 걸린 시간(초). times는 점마다 시작 후 흐른 시간(일시정지 제외). 다 채운 km만 돌려준다.
 * 시간이 없거나 길이가 다르면 빈 배열(이전 기록). 순간 튐·일시정지 중 이동한 구간은 거리에서 뺀다.
 * breaks: 기록 거리에서도 뺀 구간(재개 직후)의 끝 점 인덱스
 */
export function kmSplits(coords: LngLat[], times: number[] | undefined, breaks: number[] = []): number[] {
  if (!times || times.length !== coords.length || coords.length < 2) return [];
  const skip = new Set(breaks);
  const splits: number[] = [];
  let total = 0;
  let lastKmTime = times[0];
  for (let i = 1; i < coords.length; i++) {
    const seg = haversineKm(coords[i - 1], coords[i]);
    const dt = times[i] - times[i - 1];
    if (seg <= 0 || skip.has(i)) continue;
    if (dt <= 0 || (seg * 1000) / dt > MAX_SPEED_MPS) continue;
    while (total + seg >= splits.length + 1) {
      const f = (splits.length + 1 - total) / seg;
      const t = times[i - 1] + dt * f;
      splits.push(t - lastKmTime);
      lastKmTime = t;
    }
    total += seg;
  }
  return splits;
}

/** 경로를 w×h 상자 안에 비율을 지켜 맞춘 화면 좌표(위도 보정한 평면 근사). 점이 한 곳뿐이면 가운데 */
export function fitToBox(coords: LngLat[], width: number, height: number, inset: number): [number, number][] {
  if (coords.length === 0) return [];
  const k = Math.cos(coords[0][1] * (Math.PI / 180));
  const xs = coords.map(([lng]) => lng * k);
  const ys = coords.map(([, lat]) => lat);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = maxY - Math.min(...ys);
  const boxW = width - inset * 2;
  const boxH = height - inset * 2;
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX ? boxW / spanX : Infinity, spanY ? boxH / spanY : Infinity);
  const offX = inset + (boxW - spanX * scale) / 2;
  const offY = inset + (boxH - spanY * scale) / 2;
  return xs.map((x, i) => [offX + (x - minX) * scale, offY + (maxY - ys[i]) * scale]);
}
