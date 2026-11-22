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

// 이보다 짧은 자투리는 막대로 그리지 않는다(km)
const MIN_TAIL_KM = 0.04;

/**
 * 다 채운 km 뒤에 남은 거리(km)와 그 시간(초). kmSplits와 같은 구간만 센다.
 * 0.84 km면 { km: 0.84, sec }, 3.1 km면 { km: 0.1, sec }. 0.04 km 미만이거나 시간이 없으면 null
 */
export function kmTail(coords: LngLat[], times: number[] | undefined, breaks: number[] = []): { km: number; sec: number } | null {
  if (!times || times.length !== coords.length || coords.length < 2) return null;
  const skip = new Set(breaks);
  let total = 0;
  let whole = 0;
  let lastKmTime = times[0];
  for (let i = 1; i < coords.length; i++) {
    const seg = haversineKm(coords[i - 1], coords[i]);
    const dt = times[i] - times[i - 1];
    if (seg <= 0 || skip.has(i)) continue;
    if (dt <= 0 || (seg * 1000) / dt > MAX_SPEED_MPS) continue;
    while (total + seg >= whole + 1) {
      lastKmTime = times[i - 1] + dt * ((whole + 1 - total) / seg);
      whole++;
    }
    total += seg;
  }
  const km = total - whole;
  if (km < MIN_TAIL_KM) return null;
  return { km, sec: times[times.length - 1] - lastKmTime };
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

// 서버가 남의 러닝에서 잘라 보내는 출발·도착 구간(apps/server/src/runs/home-privacy.ts HOME_TRIM_METERS와 같다)
export const HOME_TRIM_KM = 0.1;

/** 지도 경로 연출용: 선으로 그릴 구간(main), 집 근처라 점선으로만 보일 앞뒤(head·tail), 1 km 점(km은 원래 출발점 기준) */
export interface RouteGeometry {
  main: LngLat[];
  head: LngLat[];
  tail: LngLat[];
  /** t: main 위 비율(0~1) — 빛이 지날 때 물결 */
  kms: { km: number; at: LngLat; t: number }[];
}

// 경로 위 거리(km)들의 지점. 경로 밖 거리는 끝점으로
function pointsAlong(coords: LngLat[], distances: number[]): LngLat[] {
  const out: LngLat[] = [];
  let total = 0;
  let i = 1;
  for (const d of distances) {
    while (i < coords.length && total + haversineKm(coords[i - 1], coords[i]) < d) {
      total += haversineKm(coords[i - 1], coords[i]);
      i++;
    }
    if (i >= coords.length) { out.push(coords[coords.length - 1]); continue; }
    const seg = haversineKm(coords[i - 1], coords[i]);
    const f = seg > 0 ? (d - total) / seg : 0;
    const [a, b] = [coords[i - 1], coords[i]];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

// from~to(km) 구간의 점들(양 끝은 보간점)
function slice(coords: LngLat[], cumulative: number[], from: number, to: number): LngLat[] {
  const [start, end] = pointsAlong(coords, [from, to]);
  const inner = coords.filter((_, i) => cumulative[i] > from && cumulative[i] < to);
  return [start, ...inner, end];
}

/**
 * own: 내 러닝이면 원본 전체가 오므로 앞뒤 100 m를 점선(head·tail)으로 나눠 「남에게는 가려 보인다」를 보여 준다.
 * 남의 러닝은 서버가 이미 잘라 보냈으니 전부 main이고, km은 잘린 100 m만큼 밀어 원래 출발점 기준으로 센다.
 */
export function routeGeometry(coords: LngLat[], own: boolean): RouteGeometry {
  if (coords.length < 2) return { main: coords, head: [], tail: [], kms: [] };
  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) cumulative.push(cumulative[i - 1] + haversineKm(coords[i - 1], coords[i]));
  const total = cumulative[cumulative.length - 1];
  const trim = own && total > HOME_TRIM_KM * 2 ? HOME_TRIM_KM : 0;
  const offset = own ? 0 : HOME_TRIM_KM;
  const kmList: number[] = [];
  for (let km = 1; km - offset < total - trim; km++) if (km - offset > trim) kmList.push(km);
  const kmAt = pointsAlong(coords, kmList.map((km) => km - offset));
  return {
    main: trim ? slice(coords, cumulative, trim, total - trim) : coords,
    head: trim ? slice(coords, cumulative, 0, trim) : [],
    tail: trim ? slice(coords, cumulative, total - trim, total) : [],
    kms: kmList.map((km, i) => ({ km, at: kmAt[i], t: (km - offset - trim) / (total - trim * 2) })),
  };
}
