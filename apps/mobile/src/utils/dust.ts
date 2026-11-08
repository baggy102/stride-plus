// 러닝 종료 전환(Dust): 기록 중 점 구름 → 천천히 흩어짐 → 구간별 페이스 막대로 흘러내려 쌓임.
// 가루 배치는 JS에서 한 번 만들고(buildDust), 매 프레임 위치는 UI 스레드 worklet(dustPos)이 계산한다.
// 시각은 시안(5400 단위)과 같은 수치로 두고, 실제 길이(DUST_MS)로 늘이거나 줄여 쓴다.

export const DUST_MS = 3000;
export const DUST_TIMELINE = 5400;
/** 실제 ms → 타임라인 단위 */
export const DUST_SCALE = DUST_TIMELINE / DUST_MS;

// 가루 한 알 = 숫자 16개
export const STRIDE = 16;
const X0 = 0, Y0 = 1, VX = 2, VY = 3, TX = 4, TY = 5, TOP = 6, TS = 7, DUR = 8, WOB = 9, WF = 10, SWAY = 11, DROP = 12, AGE = 13, KIND = 14;
export const KIND_TARGET = 1;
export const KIND_CORE = 2;
export const KIND_SPARK = 4;

/** 막대가 쌓일 상자(오버레이 좌표) */
export interface BarRect { x: number; y: number; w: number; h: number }

export interface Dust {
  buf: number[];
  count: number;
  cx: number;
  cy: number;
}

// 가루 수 상한: 막대 점 + 구름 보충 가루. 넘으면 막대 점 간격을 넓힌다
const MAX_TARGETS = 1500;
const MIN_PER_DOT = 2;

export function clamp01(v: number): number {
  'worklet';
  return Math.min(1, Math.max(0, v));
}
export function seg(t: number, a: number, b: number): number {
  'worklet';
  return clamp01((t - a) / (b - a));
}
export function sine(t: number): number {
  'worklet';
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}
export function out3(t: number): number {
  'worklet';
  return 1 - Math.pow(1 - clamp01(t), 3);
}
export function inOut(t: number): number {
  'worklet';
  const v = clamp01(t);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
}
function mix(a: number, b: number, k: number): number {
  'worklet';
  return a + (b - a) * k;
}

function rnd(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/**
 * dots: 기록 중 화면의 점 구름(오래된 점 → 최근 점 순서, 오버레이 좌표)
 * bars: 구간별 페이스 막대(왼쪽부터). 비어 있으면 가루는 흩어졌다 사라지기만 한다(1 km 미만)
 */
export function buildDust(dots: [number, number][], bars: BarRect[], seed = 11): Dust {
  const n = dots.length;
  if (n === 0) return { buf: [], count: 0, cx: 0, cy: 0 };
  const r = rnd(seed);
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;
  const cx = dots.reduce((s, d) => s + d[0], 0) / n;
  const cy = dots.reduce((s, d) => s + d[1], 0) / n;

  // 막대 안쪽을 격자 점으로. 바닥 줄부터 먼저 도착하도록 줄 순위(rank)를 매긴다
  const area = bars.reduce((s, b) => s + b.w * b.h, 0);
  const step = Math.max(2.2, Math.sqrt(area / MAX_TARGETS));
  const targets: { x: number; y: number; rank: number; top: number }[] = [];
  for (const b of bars) {
    const rows: number[] = [];
    for (let y = b.y + b.h - step / 2; y > b.y + 0.5; y -= step) rows.push(y);
    rows.forEach((y, ri) => {
      for (let x = b.x + step / 2; x < b.x + b.w - 0.5; x += step) {
        targets.push({ x, y, rank: ri / Math.max(1, rows.length - 1), top: b.y });
      }
    });
  }

  // 가루는 바로 위쪽 점에서 출발 → 옆으로는 거의 안 움직이고 아래로 흘러내린다
  const near = (x: number) => {
    const c: number[] = [];
    dots.forEach((d, i) => { if (Math.abs(d[0] - x) < 18) c.push(i); });
    if (c.length) return c[Math.floor(r() * c.length)];
    let best = 0;
    dots.forEach((d, i) => { if (Math.abs(d[0] - x) < Math.abs(dots[best][0] - x)) best = i; });
    return best;
  };
  const barTop = bars.length ? Math.min(...bars.map((b) => b.y)) : Math.max(...dots.map((d) => d[1])) + 220;
  const buf: number[] = [];
  const used = new Array<number>(n).fill(0);
  const push = (i: number, tg: { x: number; y: number; rank: number; top: number } | null) => {
    used[i]++;
    const [dx, dy] = dots[i];
    const core = r() < 0.34;
    const spread = core ? 1.1 : 5;
    const x0 = dx + gauss() * spread;
    const y0 = dy + gauss() * spread;
    const ang = Math.atan2(y0 - cy, x0 - cx) + gauss() * 0.9;
    const sp = 45 + r() * 110;
    const dur = 1500 + r() * 450;
    const order = n > 1 ? i / (n - 1) : 1;
    // 막대 가루: 바닥 줄은 일찍, 윗줄은 늦게 → 쌓여 올라간다. 나머지는 경로 순서대로 흘러내림
    const ts = tg ? 2500 + tg.rank * 1500 + r() * 260 - dur : 1300 + order * 1100 + r() * 320;
    const kind = (tg ? KIND_TARGET : 0) | (core ? KIND_CORE : 0) | (r() < 0.07 ? KIND_SPARK : 0);
    buf.push(
      x0, y0, Math.cos(ang) * sp, Math.sin(ang) * sp * 0.7 - 10,
      tg ? tg.x : 0, tg ? tg.y : 0, tg ? tg.top : 0,
      ts, dur, r() * 6.28, 1.5 + r() * 2, gauss() * 5, barTop - 10 + r() * 60,
      0.3 + 0.7 * order, kind, 0,
    );
  };
  for (const tg of targets) push(near(tg.x), tg);
  dots.forEach((_, i) => { for (let k = used[i]; k < MIN_PER_DOT; k++) push(i, null); });
  return { buf, count: buf.length / STRIDE, cx, cy };
}

/**
 * i번째 가루의 t(타임라인 단위) 시점 상태를 out에 쓴다: [x, y, 진행도 u, 남은 밝기]
 * 들숨(0~420) → 공기 저항을 받는 흩어짐(300~) → 흘러내림(ts~ts+dur)
 */
export function dustPos(buf: number[], i: number, t: number, cx: number, cy: number, out: number[]): void {
  'worklet';
  const o = i * STRIDE;
  const inh = Math.sin(Math.PI * seg(t, 0, 420)) * 0.05;
  const x = buf[o + X0] + (cx - buf[o + X0]) * inh;
  const y = buf[o + Y0] + (cy - buf[o + Y0]) * inh;
  const tau = Math.max(0, t - 300) / 1000;
  const drift = (1 - Math.exp(-1.25 * tau)) / 1.25;
  const wob = Math.min(1, tau * 2);
  const w0 = buf[o + WOB], wf = buf[o + WF];
  const bx = x + buf[o + VX] * drift + Math.sin(w0 + tau * wf) * 3 * wob;
  const by = y + buf[o + VY] * drift + Math.cos(w0 + tau * wf * 0.8) * 2.5 * wob;
  const u = seg(t, buf[o + TS], buf[o + TS] + buf[o + DUR]);
  if (u <= 0) { out[0] = bx; out[1] = by; out[2] = 0; out[3] = 1; return; }
  // 천천히 떨어지기 시작해 점점 빨라지고, 내려앉을 때만 부드럽게 멈춘다
  const side = sine(u);
  if ((buf[o + KIND] & KIND_TARGET) === 0) {
    out[0] = bx + buf[o + SWAY] * side + Math.sin(w0 + u * 6) * 2;
    out[1] = by + (buf[o + DROP] - by) * Math.pow(u, 2.1);
    out[2] = u;
    out[3] = 1 - sine(seg(u, 0.5, 1));
    return;
  }
  out[0] = mix(bx, buf[o + TX], side) + Math.sin(Math.PI * u) * buf[o + SWAY];
  out[1] = mix(by, buf[o + TY], sine(Math.pow(u, 1.7)));
  out[2] = u;
  out[3] = 1;
}

/** 가루 한 알의 불투명도(0~1). settle = 막대로 굳으며 가루가 사라지는 정도 */
export function dustAlpha(buf: number[], i: number, u: number, left: number, settle: number): number {
  'worklet';
  const o = i * STRIDE;
  const kind = buf[o + KIND];
  const age = buf[o + AGE];
  const rest = (kind & KIND_CORE) !== 0 ? age : age * 0.5;
  // 막대 안에 내려앉은 가루는 막대처럼 위가 진하고 아래가 옅다
  const land = (kind & KIND_TARGET) !== 0 ? mix(1, 0.45, clamp01((buf[o + TY] - buf[o + TOP]) / 44)) : 0.7;
  return settle * left * mix(rest, land, out3(u * 1.4));
}

export function dustKind(buf: number[], i: number): number {
  'worklet';
  return buf[i * STRIDE + KIND];
}
