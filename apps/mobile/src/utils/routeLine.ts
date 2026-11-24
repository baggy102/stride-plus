// 경로 선 v2 선 쌓기(SPEC_LA4 3-2 ~ 3-7, 2026-11-24 앱 적용). 지도(WebView) · 공유 이미지 · 카드가 같은 수치를 쓴다.
// 아래에서 위로: 0 격자 지우기(격자 · 점 바탕 위일 때만) → 1 바깥 빛 → 2 안쪽 빛 → 3 선 몸 → 4 속선(머리 쪽 30 px) → 표식.
// 1 · 2 · 3층은 길이로 나눈 띠마다 한 Path(맞댄 끝)라 반투명이 겹치지 않고(구슬 없음), 출발 쪽은 옅고 지금 · 도착 쪽이 밝다.
// 고정 방향 겹 가닥 · 고른 띠 번짐은 쓰지 않는다. 노드 테스트가 불러도 되게 팔레트는 타입만 가져온다
import type { Palette } from '@/theme/colors';

export const LINE_V2 = {
  bands: 8,
  /** 1 바깥 빛: 굵기 min(max, 몸 × mul), 불투명도 최대 op(일시정지 opPaused) */
  outer: { mul: 5, max: 14, op: 0.14, opPaused: 0.06 },
  /** 2 안쪽 빛: 몸 × mul */
  inner: { mul: 2.4, op: 0.3, opPaused: 0.16 },
  /** 빛 불투명도 = 최대 × (floor + (1 - floor) × min(1, t / full)) */
  glow: { floor: 0.25, full: 0.75 },
  /** 3 선 몸: 굵기 w0 → 1(길이 wFull까지), 불투명도 op0 → 1(길이 opFull까지) */
  body: { w0: 0.75, wFull: 0.3, op0: 0.55, opFull: 0.7 },
  /** 4 속선(꼬리 빛): 머리 쪽 len px를 steps로 나눠 op0 → op1 */
  core: { mul: 0.45, len: 30, steps: 6, op0: 0.15, op1: 0.85 },
  /** 0 격자 지우기: 안쪽 빛 + add, 바탕색 */
  knock: { add: 3, op: 0.9 },
  /** 출발 표시 · 출발 끝 둥근 마개(몸 굵기 w0의 절반, op) */
  start: { r: 2.6, w: 1.2, op: 0.55 },
  /** 지금 위치 · 도착: 속 · 테 · 반지름 그라데이션 번짐(가운데 몸 색 → mid 지점 바깥 빛 색 → 0) */
  head: { core: 2.8, ring: 5.2, ringW: 1.2, ringOp: 0.8, pausedRing: 5, bloomIn: 0.55, bloomMid: 0.45, bloomMidOp: 0.16 },
  /** km 빛 알갱이: 선 위 작은 밝은 점(선을 끊지 않는다) */
  km: { r: 1.5, op: 0.85 },
  /**
   * 빛 가루(점 구름 대체, v2 「진하게」): 길이 step px마다, from부터, two 뒤로는 두 알, 선에서 (1 + off × t) px까지.
   * 거리 · 크기는 몸 굵기 body 기준이라 굵은 선에서는 그만큼 넓힌다(안쪽 빛 밖으로 나오게)
   */
  dust: { body: 3.2, step: 2, from: 0.06, two: 0.7, off: 3.6, along: 1, r0: 0.7, r1: 0.7, op0: 0.2, op1: 0.55, paused: 0.6 },
} as const;

/** 띠 이음매 겹침(px). 불투명하게 섞은 선 몸 · 속선을 이만큼 다음 띠 밑으로 늘려, 맞댄 끝 사이로 바탕이 비치는 가는 틈을 없앤다 */
export const SEAM = 0.75;

export interface BandStyle {
  /** 띠 범위(0 = 출발, 1 = 지금 · 도착) */
  t0: number;
  t1: number;
  outerW: number;
  outerOp: number;
  innerW: number;
  innerOp: number;
  bodyW: number;
  bodyOp: number;
}

/** 길이를 n등분한 띠 경계 */
export function evenStops(n: number = LINE_V2.bands): number[] {
  return Array.from({ length: n + 1 }, (_, i) => i / n);
}

const ramp = (t: number, full: number) => Math.min(1, t / full);

/** 띠마다 굵기 · 불투명도(띠 가운데 t 기준). body = 선 몸 굵기 */
export function bandStyles(body: number, o: { paused?: boolean; stops?: number[] } = {}): BandStyle[] {
  const V = LINE_V2;
  const stops = o.stops ?? evenStops();
  const outerW = Math.min(V.outer.max, body * V.outer.mul);
  const innerW = body * V.inner.mul;
  return stops.slice(1).map((t1, i) => {
    const t0 = stops[i];
    const t = (t0 + t1) / 2;
    const g = V.glow.floor + (1 - V.glow.floor) * ramp(t, V.glow.full);
    return {
      t0, t1,
      outerW, outerOp: (o.paused ? V.outer.opPaused : V.outer.op) * g,
      innerW, innerOp: (o.paused ? V.inner.opPaused : V.inner.op) * g,
      bodyW: body * (V.body.w0 + (1 - V.body.w0) * ramp(t, V.body.wFull)),
      bodyOp: V.body.op0 + (1 - V.body.op0) * ramp(t, V.body.opFull),
    };
  });
}

/** 0층 격자 지우기 굵기 */
export const knockWidth = (body: number) => body * LINE_V2.inner.mul + LINE_V2.knock.add;

/** 4층 속선: 머리 쪽 len 길이를 나눈 조각(f0 ~ f1은 그 길이 안 비율)과 불투명도 */
export function coreSteps(): { f0: number; f1: number; op: number }[] {
  const { steps, op0, op1 } = LINE_V2.core;
  return Array.from({ length: steps }, (_, j) => ({ f0: j / steps, f1: (j + 1) / steps, op: op0 + ((op1 - op0) * (j + 1)) / steps }));
}

/** 선 색 한 벌. body는 보이는 선(Ice · 민트 · Pearl), outer는 바깥 빛, core는 속선 · km 알갱이, head는 머리 속 */
export interface LineTone {
  body: string;
  outer: string;
  core: string;
  head: string;
  warn: string;
}

/**
 * 맥락의 선 색(col)을 지킨 한 벌. 기본(Ice)은 바깥 빛만 Signal Blue(0.14 이하), 민트(NEW · 처음 달린 길)와 Pearl(HYPE)은 같은 색으로 번진다.
 * 다크: 속선 · 머리는 흰색이 아니라 text(Pearl과 헷갈리지 않게, HYPE만 Pearl). 라이트: 속선은 진한 선 안의 흰 빛, 머리는 선 색
 */
export function lineTone(p: Palette, col: string = p.map.dot): LineTone {
  const base = col === p.map.dot || col === p.value;
  const hype = col === p.hype;
  return {
    body: col,
    outer: base ? p.point : col,
    core: p.dark ? (hype ? p.hype : p.text) : '#FFFFFF',
    head: p.dark ? (hype ? p.hype : p.text) : col,
    warn: p.warn,
  };
}

function rgb(c: string): [number, number, number] {
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** '#RRGGBB' a를 t, b를 1 - t만큼 섞는다 */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** 바탕(ground) 위에 바깥 빛 · 안쪽 빛 · 반투명 선 몸을 쌓은 것과 같은 불투명 색(띠 하나). 이음매 틈을 없애려고 선 몸은 이 색으로 그린다 */
export function solidBody(tone: LineTone, ground: string, s: Pick<BandStyle, 'outerOp' | 'innerOp' | 'bodyOp'>): string {
  const under = mixHex(tone.body, mixHex(tone.outer, ground, s.outerOp), s.innerOp);
  return mixHex(tone.body, under, s.bodyOp);
}

/** 지도(기록 · 요약 · 상세)와 경로 연출이 쓰는 한 벌: 색 + 지도 바탕 위 띠별 선 몸 색(기록 · 일시정지) + 속선 조각 색 */
export interface LineLook extends LineTone {
  bodies: string[];
  bodiesPaused: string[];
  cores: string[];
}

export function lineLook(p: Palette, col?: string): LineLook {
  const tone = lineTone(p, col);
  const bodies = bandStyles(1).map((s) => solidBody(tone, p.map.bg, s));
  return {
    ...tone,
    bodies,
    bodiesPaused: bandStyles(1, { paused: true }).map((s) => solidBody(tone, p.map.bg, s)),
    cores: coreSteps().map((k) => mixHex(tone.core, bodies[bodies.length - 1], k.op)),
  };
}

export type Pt = [number, number];

/** 누적 길이 */
export function cumLen(ps: Pt[]): number[] {
  const c = [0];
  for (let i = 1; i < ps.length; i++) c.push(c[i - 1] + Math.hypot(ps[i][0] - ps[i - 1][0], ps[i][1] - ps[i - 1][1]));
  return c;
}

// 길이 L이 들어가는 칸과 비율
function find(c: number[], L: number): [number, number] {
  const last = c.length - 1;
  if (L <= 0 || last < 1) return [0, 0];
  if (L >= c[last]) return [last - 1, 1];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c[m] <= L) lo = m;
    else hi = m;
  }
  const s = c[hi] - c[lo];
  return [lo, s > 0 ? (L - c[lo]) / s : 0];
}

const mix = (a: Pt, b: Pt, f: number): Pt => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

/** 길이 L 지점 */
export function pointAtLen(ps: Pt[], c: number[], L: number): Pt {
  if (ps.length < 2) return ps[0];
  const [i, f] = find(c, L);
  return mix(ps[i], ps[i + 1], f);
}

/** 길이 a ~ b 구간의 점(양 끝은 보간점) */
export function sliceLen(ps: Pt[], c: number[], a: number, b: number): Pt[] {
  if (ps.length < 2) return ps.slice();
  const [i0, f0] = find(c, a);
  const [i1, f1] = find(c, b);
  const out: Pt[] = [mix(ps[i0], ps[i0 + 1], f0)];
  for (let i = i0 + 1; i <= i1; i++) out.push(ps[i]);
  out.push(mix(ps[i1], ps[i1 + 1], f1));
  return out;
}

/** SVG d(소수 한 자리) */
export function pathD(ps: Pt[]): string {
  return ps.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');
}

/** 길이 범위 [a, b]에서 ranges와 겹치는 부분(inside)과 나머지(outside). ranges는 정렬 · 겹침 없음 */
export function splitRanges(a: number, b: number, ranges: [number, number][]): { inside: [number, number][]; outside: [number, number][] } {
  const inside: [number, number][] = [];
  const outside: [number, number][] = [];
  let x = a;
  for (const [r0, r1] of ranges) {
    if (r1 <= x || r0 >= b) continue;
    if (r0 > x) outside.push([x, r0]);
    inside.push([Math.max(x, r0), Math.min(b, r1)]);
    x = Math.min(b, r1);
  }
  if (x < b) outside.push([x, b]);
  return { inside, outside };
}
