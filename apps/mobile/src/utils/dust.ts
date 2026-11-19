// 러닝 종료 전환(Dust): 기록 중 점 구름 → 들숨 → 경로를 따라 금이 가며 깨짐 → 조각이 자기 km 막대로 내려앉아 얼어붙음.
// 가루 배치는 JS에서 한 번 만들고(buildDust), 매 프레임 위치는 UI 스레드 worklet(dustPos)이 계산한다.
// 가루 시각은 실제 ms. 요약 화면의 다른 요소(머리·시트 등)는 시안 타임라인(5400 단위)을 DUST_SCALE로 바꿔 쓴다.

export const DUST_MS = 3000;
export const DUST_TIMELINE = 5400;
/** 실제 ms → 타임라인 단위 */
export const DUST_SCALE = DUST_TIMELINE / DUST_MS;

// 가루 한 알 = 숫자 12개
export const STRIDE = 12;
const X0 = 0, Y0 = 1, NX = 2, NY = 3, TX = 4, TY = 5, TOP = 6, TS = 7, DUR = 8, FRZ = 9, AGE = 10, KIND = 11;
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

// 금(깨짐) → 0.7초부터 1 km 막대부터 차례로 내려앉음 → 막대가 80% 쌓이면 얼어붙음(ms)
const CRACK_FROM = 250;
const CRACK_TO = 700;
const FALL_AT = 700;
const ROW_SPREAD = 260;
const FALL_JITTER = 120;
/** 반짝임 · 겹침 합성(Plus)은 이때까지만(ms) */
export const SPARK_UNTIL = 550;

// 가루 수 = 점 구름 점 × 7(220~1500)
const PER_DOT = 7;
const MIN_TARGETS = 220;
const MAX_TARGETS = 1500;

/** 막대 사이 출발 간격(ms) */
export function barStagger(barCount: number): number {
  'worklet';
  return Math.min(120, 600 / Math.max(1, barCount));
}
/** i번째 막대가 얼어붙는 시각(ms) */
export function freezeAt(i: number, barCount: number): number {
  'worklet';
  return FALL_AT + i * barStagger(barCount) + ROW_SPREAD + FALL_JITTER + 680;
}
/** 전환 전체 길이(ms) */
export function dustTotal(barCount: number): number {
  return Math.max(2600, freezeAt(Math.max(0, barCount - 1), Math.max(1, barCount)) + 900);
}

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

/** 점마다 몇 번째 km인지(0부터): 화면 위 누적 길이 비율 × 총 거리. barCount - 1을 넘지 않는다 */
export function dotKm(dots: [number, number][], km: number, barCount: number): number[] {
  const cum = [0];
  for (let i = 1; i < dots.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(dots[i][0] - dots[i - 1][0], dots[i][1] - dots[i - 1][1]));
  }
  const len = cum[cum.length - 1];
  return cum.map((c, i) => {
    const f = len > 0 ? c / len : dots.length > 1 ? i / (dots.length - 1) : 0;
    return Math.max(0, Math.min(barCount - 1, Math.floor(f * km)));
  });
}

/**
 * dots: 기록 중 화면의 점 구름(오래된 점 → 최근 점 순서, 오버레이 좌표)
 * bars: km별 페이스 막대(왼쪽부터, 마지막은 자투리일 수 있다). 비어 있으면 가루는 깨졌다 녹아 사라지기만 한다
 * km: 막대가 나타내는 총 거리(다 채운 km + 자투리)
 */
export function buildDust(dots: [number, number][], bars: BarRect[], km: number, seed = 11): Dust {
  const n = dots.length;
  if (n === 0) return { buf: [], count: 0, cx: 0, cy: 0 };
  const r = rnd(seed);
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;
  const cx = dots.reduce((s, d) => s + d[0], 0) / n;
  const cy = dots.reduce((s, d) => s + d[1], 0) / n;
  const m = bars.length;

  // 막대 안쪽을 격자 점으로. 바닥 줄부터 먼저 도착하도록 줄 순위(rank)를 매긴다
  const budget = Math.min(MAX_TARGETS, Math.max(MIN_TARGETS, n * PER_DOT));
  const area = bars.reduce((s, b) => s + b.w * b.h, 0);
  const step = Math.max(2, Math.sqrt(area / budget));
  const targets: { x: number; y: number; rank: number; top: number; bar: number }[] = [];
  bars.forEach((b, bar) => {
    const rows: number[] = [];
    for (let y = b.y + b.h - step / 2; y > b.y + 0.5; y -= step) rows.push(y);
    rows.forEach((y, ri) => {
      for (let x = b.x + step / 2; x < b.x + b.w - 0.5; x += step) {
        targets.push({ x, y, rank: ri / Math.max(1, rows.length - 1), top: b.y, bar });
      }
    });
  });

  // k번째 km의 점 → k번째 막대. 그 km에 점이 없으면 아무 점에서나
  const kmOf = m ? dotKm(dots, km, m) : [];
  const byKm: number[][] = Array.from({ length: m }, () => []);
  kmOf.forEach((k, i) => byKm[k].push(i));
  const pick = (bar: number) => {
    const c = byKm[bar].length ? byKm[bar] : dots.map((_, i) => i);
    return c[Math.floor(r() * c.length)];
  };

  // 금: 이웃 점을 이은 접선의 수직 방향(경로가 갈라지듯)
  const normal = (i: number): [number, number] => {
    const a = dots[Math.max(0, i - 1)], b = dots[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) { const ang = r() * Math.PI * 2; return [Math.cos(ang), Math.sin(ang)]; }
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };

  const buf: number[] = [];
  const used = new Array<number>(n).fill(0);
  const push = (i: number, tg: { x: number; y: number; rank: number; top: number; bar: number } | null) => {
    used[i]++;
    const [dx, dy] = dots[i];
    const core = r() < 0.34;
    const spread = core ? 1.1 : 5;
    const [nx, ny] = normal(i);
    const crack = (5 + r() * 13) * (r() < 0.5 ? -1 : 1);
    // 막대 가루: km 순서대로, 바닥 줄은 일찍 · 윗줄은 늦게 → 쌓여 올라간다. 나머지는 0.45~0.8초에 녹아 사라진다
    const ts = tg ? FALL_AT + tg.bar * barStagger(m) + tg.rank * ROW_SPREAD + r() * FALL_JITTER : 450 + r() * 150;
    const dur = tg ? 650 + r() * 200 : 200;
    const kind = (tg ? KIND_TARGET : 0) | (core ? KIND_CORE : 0) | (r() < 0.07 ? KIND_SPARK : 0);
    buf.push(
      dx + gauss() * spread, dy + gauss() * spread, nx * crack, ny * crack,
      tg ? tg.x : 0, tg ? tg.y : 0, tg ? tg.top : 0,
      ts, dur, tg ? freezeAt(tg.bar, m) : 0,
      0.3 + 0.7 * (n > 1 ? i / (n - 1) : 1), kind,
    );
  };
  for (const tg of targets) push(pick(tg.bar), tg);
  // 남는 가루: 막대로 안 간 점은 하나씩, 간 점은 절반만
  dots.forEach((_, i) => { if (used[i] === 0 || r() < 0.5) push(i, null); });
  return { buf, count: buf.length / STRIDE, cx, cy };
}

/**
 * i번째 가루의 t(ms) 시점 상태를 out에 쓴다: [x, y, 진행도 u, 남은 밝기]
 * 들숨(0~240) → 금(250~700, 강한 저항으로 금방 멈춤) → 내려앉음(ts~ts+dur) → 막대가 얼며 사라짐
 */
export function dustPos(buf: number[], i: number, t: number, cx: number, cy: number, out: number[]): void {
  'worklet';
  const o = i * STRIDE;
  const inh = Math.sin(Math.PI * seg(t, 0, 240)) * 0.05;
  const k = 1 - Math.exp(-6 * seg(t, CRACK_FROM, CRACK_TO));
  const bx = buf[o + X0] + (cx - buf[o + X0]) * inh + buf[o + NX] * k;
  const by = buf[o + Y0] + (cy - buf[o + Y0]) * inh + buf[o + NY] * k;
  const ts = buf[o + TS];
  if ((buf[o + KIND] & KIND_TARGET) === 0) {
    out[0] = bx; out[1] = by; out[2] = 0;
    out[3] = 1 - sine(seg(t, ts, ts + buf[o + DUR]));
    return;
  }
  const u = seg(t, ts, ts + buf[o + DUR]);
  const left = 1 - sine(seg(t, buf[o + FRZ] - 80, buf[o + FRZ] + 200));
  if (u <= 0) { out[0] = bx; out[1] = by; out[2] = 0; out[3] = left; return; }
  // 천천히 떨어지기 시작해 점점 빨라지고, 내려앉을 때만 부드럽게 멈춘다
  out[0] = mix(bx, buf[o + TX], sine(u));
  out[1] = mix(by, buf[o + TY], sine(Math.pow(u, 1.4)));
  out[2] = u;
  out[3] = left;
}

/** 가루 한 알의 불투명도(0~1). left = dustPos가 준 남은 밝기 */
export function dustAlpha(buf: number[], i: number, u: number, left: number): number {
  'worklet';
  const o = i * STRIDE;
  const kind = buf[o + KIND];
  const age = buf[o + AGE];
  const rest = (kind & KIND_CORE) !== 0 ? age : age * 0.5;
  // 막대 안에 내려앉은 가루는 막대처럼 위가 진하고 아래가 옅다
  const land = (kind & KIND_TARGET) !== 0 ? mix(1, 0.45, clamp01((buf[o + TY] - buf[o + TOP]) / 44)) : 0.7;
  return left * mix(rest, land, out3(u * 1.4));
}

export function dustKind(buf: number[], i: number): number {
  'worklet';
  return buf[i * STRIDE + KIND];
}
