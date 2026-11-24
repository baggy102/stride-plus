// 경로 선 v2의 매끈하게(SPEC_LA4 3-1을 앱으로 옮김). 그리는 사본만 만든다 — 원래 좌표 · routeTimes · segmentBreaks
// (거리 · 스플릿 · 업로드)는 그대로 둔다. 미터 기준이라 지도를 얼마나 확대하든 같은 선이다.
// 순서: ① 1-2-1 평균 한 번 → ② Douglas–Peucker 단순화 → ③ 모서리 깎기 두 번. 출발 점과 마지막 점(기록 중이면 지금 위치)은 그대로.
// 그린 점마다 원래 배열의 소수 번호(src)를 같이 돌려줘서 시간 · km 점 · 「처음 달린 길」 구간을 그린 선 위로 옮길 수 있다.
// 노드 테스트가 이 파일만 불러도 되게 route.ts는 타입만 가져온다
import type { KmMark, LngLat, RouteGeometry } from './route';

export interface SmoothOptions {
  /** ② 단순화 허용 오차(m). ① 평균이 한 점을 옮기는 거리도 이 값까지(점이 듬성한 모퉁이를 깎지 않게) */
  eps: number;
  /** ③ 모서리 깎기 1차 · 2차 최대(m). 모서리마다 양옆 구간의 1/4까지만 깎는다 */
  r1: number;
  r2: number;
}

/** 지도(확대 13~18)용. 확대 16(약 1.9 m/px)에서 1.6 px · 2.6 px · 1.3 px */
export const MAP_SMOOTH: SmoothOptions = { eps: 3, r1: 5, r2: 2.5 };

/** 그리는 사본: 점과, 점마다 원래 배열의 소수 번호(0 ~ n-1, 늘어나기만) */
export interface DrawnRoute {
  pts: LngLat[];
  src: number[];
}

type XY = [number, number];

// ②는 원래 번호 64개마다 마디를 남긴다. 기록 중 점이 늘어도 이미 그린 앞부분이 다시 계산되지 않아 선이 흔들리지 않는다
const CHUNK = 64;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320;
// 이보다 덜 꺾인 점은 깎지 않는다(곧은 길에 점이 두 배로 늘지 않게)
const STRAIGHT_SIN = 0.02;

// 첫 점 기준 평면(m). 러닝 범위(수십 km)에서는 충분히 정확하다
function frame(origin: LngLat) {
  const [lng0, lat0] = origin;
  const kx = M_PER_DEG_LNG * Math.cos((lat0 * Math.PI) / 180);
  return {
    to: ([lng, lat]: LngLat): XY => [(lng - lng0) * kx, (lat - lat0) * M_PER_DEG_LAT],
    back: ([x, y]: XY): LngLat => [lng0 + x / kx, lat0 + y / M_PER_DEG_LAT],
  };
}

// ① 1-2-1 평균 한 번(양 끝 고정). 점이 촘촘하면(앞뒤 이웃 사이 4·maxShift 이하) 그대로 평균해 한 점만 튄 떨림을 줄이고,
// 듬성하면(GPS가 끊긴 뒤 · 오래된 기록) maxShift까지만 옮겨 모퉁이를 깎지 않는다
function average(p: XY[], maxShift: number): XY[] {
  return p.map((q, i) => {
    if (i === 0 || i === p.length - 1) return q;
    const a = p[i - 1];
    const b = p[i + 1];
    let dx = (a[0] + b[0]) / 4 - q[0] / 2;
    let dy = (a[1] + b[1]) / 4 - q[1] / 2;
    const d = Math.hypot(dx, dy);
    if (d > maxShift && Math.hypot(b[0] - a[0], b[1] - a[1]) > 4 * maxShift) {
      dx *= maxShift / d;
      dy *= maxShift / d;
    }
    return [q[0] + dx, q[1] + dy];
  });
}

function segDist(q: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
}

// ② Douglas–Peucker(선분까지 거리 — 되돌아 뛴 끝이 직선 연장선 위에 있어도 지워지지 않는다). 남길 번호
function simplify(p: XY[], eps: number): number[] {
  const n = p.length;
  const keep = new Uint8Array(n);
  const stack: [number, number][] = [];
  for (let i = 0; i < n - 1; i += CHUNK) {
    keep[i] = 1;
    stack.push([i, Math.min(i + CHUNK, n - 1)]);
  }
  keep[n - 1] = 1;
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    let dm = 0;
    let k = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = segDist(p[i], p[i0], p[i1]);
      if (d > dm) { dm = d; k = i; }
    }
    if (dm > eps) {
      keep[k] = 1;
      stack.push([i0, k], [k, i1]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

// ③ 모서리 깎기(Chaikin 변형) 한 번: 모서리마다 양옆 구간의 1/4, 최대 rmax까지. 곧은 길은 곧게, 모퉁이만 둥글게.
// 깎는 길이는 꺾인 각에 맞춘다(직각에서 rmax 그대로 = 잠금화면 v2와 같고, 되돌아 뛴 끝은 거의 깎지 않아 끝이 짧아지지 않는다)
function cut(p: XY[], s: number[], rmax: number): { p: XY[]; s: number[] } {
  if (p.length < 3) return { p, s };
  const op: XY[] = [p[0]];
  const os: number[] = [s[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1];
    const b = p[i];
    const c = p[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const turn = l1 > 0 && l2 > 0 ? Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) / (l1 * l2) : 0;
    const ahead = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) >= 0;
    if (turn < STRAIGHT_SIN && ahead) {
      op.push(b);
      os.push(s[i]);
      continue;
    }
    // 안쪽 각 α의 sin(α/2) ÷ sin(45°): 직각 1, 머리핀 0
    const cosA = l1 > 0 && l2 > 0 ? -((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / (l1 * l2) : 1;
    const r = rmax * Math.sqrt(Math.max(0, (1 - cosA) / 2)) / Math.SQRT1_2;
    const f1 = l1 > 0 ? Math.min(l1 / 4, r) / l1 : 0;
    const f2 = l2 > 0 ? Math.min(l2 / 4, r) / l2 : 0;
    op.push([b[0] + (a[0] - b[0]) * f1, b[1] + (a[1] - b[1]) * f1], [b[0] + (c[0] - b[0]) * f2, b[1] + (c[1] - b[1]) * f2]);
    os.push(s[i] + (s[i - 1] - s[i]) * f1, s[i] + (s[i + 1] - s[i]) * f2);
  }
  op.push(p[p.length - 1]);
  os.push(s[s.length - 1]);
  return { p: op, s: os };
}

/** 그리는 사본을 만든다. 출발 점과 마지막 점은 원래 값 그대로 */
export function smoothRoute(coords: LngLat[], o: SmoothOptions = MAP_SMOOTH): DrawnRoute {
  const n = coords.length;
  if (n < 3) return { pts: coords.slice(), src: coords.map((_, i) => i) };
  const f = frame(coords[0]);
  const xy = average(coords.map(f.to), o.eps);
  const idx = simplify(xy, o.eps);
  let step = { p: idx.map((i) => xy[i]), s: idx };
  step = cut(step.p, step.s, o.r1);
  step = cut(step.p, step.s, o.r2);
  const pts = step.p.map(f.back);
  pts[0] = coords[0];
  pts[pts.length - 1] = coords[n - 1];
  return { pts, src: step.s };
}

/** 경로 범위가 w×h 상자(inset 안쪽)에 들어갈 때 1 px이 몇 m인가(fitToBox와 같은 맞춤) */
export function metresPerPx(coords: LngLat[], width: number, height: number, inset: number): number {
  if (coords.length < 2) return 0;
  const f = frame(coords[0]);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of coords) {
    const [x, y] = f.to(c);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return Math.max((x1 - x0) / Math.max(1, width - inset * 2), (y1 - y0) / Math.max(1, height - inset * 2));
}

/**
 * 크기가 정해진 그림(공유 이미지 · 카드)용 세기: 잠금화면 v2 값(ε 1 px · 모서리 6 / 3 px)을 그 그림의 m로 바꾸고,
 * 지도값(MAP_SMOOTH)보다 약하게는 하지 않는다. 확대할 일이 없는 그림이라 화면 크기 기준이어도 된다
 */
export function boxSmooth(coords: LngLat[], width: number, height: number, inset: number): SmoothOptions {
  const mpp = metresPerPx(coords, width, height, inset);
  return { eps: Math.max(MAP_SMOOTH.eps, mpp), r1: Math.max(MAP_SMOOTH.r1, mpp * 6), r2: Math.max(MAP_SMOOTH.r2, mpp * 3) };
}

// src에서 u가 들어가는 칸(lo, hi)과 비율
function bracket(src: number[], u: number): [number, number, number] {
  const n = src.length;
  if (u <= src[0]) return [0, 0, 0];
  if (u >= src[n - 1]) return [n - 1, n - 1, 0];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (src[m] <= u) lo = m;
    else hi = m;
  }
  const span = src[hi] - src[lo];
  return [lo, hi, span > 0 ? (u - src[lo]) / span : 0];
}

/** 원래 번호 u(소수)에 해당하는 그린 선 위의 점. pts는 src와 짝인 점이면 무엇이든(경위도 · 화면 좌표) */
export function pointAtSource(pts: [number, number][], src: number[], u: number): [number, number] {
  const [lo, hi, t] = bracket(src, u);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}

/** 그린 점마다의 값(예: 그린 선의 누적 길이)을 원래 번호 u에서 */
export function valueAtSource(values: number[], src: number[], u: number): number {
  const [lo, hi, t] = bracket(src, u);
  return values[lo] + (values[hi] - values[lo]) * t;
}

/** 원래 배열의 값(예: routeTimes)을 소수 번호 u에서. 그린 점의 시각은 rawValueAt(times, src[k]) */
export function rawValueAt(values: number[], u: number): number {
  const i = Math.max(0, Math.min(values.length - 1, Math.floor(u)));
  const j = Math.min(values.length - 1, i + 1);
  return values[i] + (values[j] - values[i]) * Math.max(0, Math.min(1, u - i));
}

/**
 * 원래 경로 위에 있는 점 p(예: km 지점)의 소수 번호. from부터 찾고, 선분 위에 딱 놓인 첫 자리를 쓴다
 * (같은 길을 되돌아와도 앞의 km가 뒤 구간으로 가지 않게). 없으면 가장 가까운 자리
 */
export function locateOnRoute(coords: LngLat[], p: LngLat, from = 0): number {
  if (coords.length < 2) return 0;
  const k = Math.cos((coords[0][1] * Math.PI) / 180);
  let best = Infinity;
  let bu = from;
  for (let i = Math.max(0, Math.floor(from)); i < coords.length - 1; i++) {
    const [ax, ay] = coords[i];
    const dx = (coords[i + 1][0] - ax) * k;
    const dy = coords[i + 1][1] - ay;
    const qx = (p[0] - ax) * k;
    const qy = p[1] - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, (qx * dx + qy * dy) / l2)) : 0;
    const d = Math.hypot(qx - t * dx, qy - t * dy);
    if (d < 1e-10) return Math.max(from, i + t);
    if (d < best) { best = d; bu = i + t; }
  }
  return bu;
}

/** 원래 구간 표시(구간 i = 점 i → i+1)에서 켜진 구간들을 원래 번호 범위 [시작, 끝]으로 묶는다 */
export function flagRanges(flags: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  flags.forEach((on, i) => {
    if (!on) return;
    const last = out[out.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else out.push([i, i + 1]);
  });
  return out;
}

/** 지도 경로 연출용 RouteGeometry의 그리는 사본: main · head · tail을 따로 매끈하게(이음매는 그대로), km 점은 그린 선 위로 */
export function smoothGeometry(g: RouteGeometry, o: SmoothOptions = MAP_SMOOTH): RouteGeometry {
  const main = smoothRoute(g.main, o);
  let from = 0;
  return {
    main: main.pts,
    head: smoothRoute(g.head, o).pts,
    tail: smoothRoute(g.tail, o).pts,
    kms: g.kms.map((k) => {
      from = locateOnRoute(g.main, k.at, from);
      return { ...k, at: pointAtSource(main.pts, main.src, from) };
    }),
  };
}

/** km 눈금(원래 거리 기준)을 그린 선 위로. 방향은 그린 선의 앞뒤 점 */
export function snapKmMarks(coords: LngLat[], drawn: DrawnRoute, marks: KmMark[]): KmMark[] {
  let from = 0;
  return marks.map((m) => {
    from = locateOnRoute(coords, m.at, from);
    return {
      km: m.km,
      at: pointAtSource(drawn.pts, drawn.src, from),
      from: pointAtSource(drawn.pts, drawn.src, Math.max(0, from - 1)),
      to: pointAtSource(drawn.pts, drawn.src, Math.min(coords.length - 1, from + 1)),
    };
  });
}

/** 원래 점마다 그린 선까지 거리(m) 중 가장 큰 값 — 「모양은 그대로」 확인용 */
export function maxDeviationM(raw: LngLat[], drawn: LngLat[]): number {
  if (raw.length === 0 || drawn.length === 0) return 0;
  const f = frame(raw[0]);
  const d = drawn.map(f.to);
  let worst = 0;
  for (const q of raw.map(f.to)) {
    let best = d.length === 1 ? Math.hypot(q[0] - d[0][0], q[1] - d[0][1]) : Infinity;
    for (let i = 1; i < d.length; i++) best = Math.min(best, segDist(q, d[i - 1], d[i]));
    worst = Math.max(worst, best);
  }
  return worst;
}
