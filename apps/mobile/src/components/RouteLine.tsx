import { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import {
  bandStyles, coreSteps, cumLen, evenStops, knockWidth, LINE_V2, mixHex, pathD, SEAM, sliceLen, solidBody, splitRanges, type LineTone, type Pt,
} from '@/utils/routeLine';

interface Props {
  /** 매끈하게 한 뒤(routeSmooth) 그림에 맞춘 점(px) */
  pts: Pt[];
  /** 선 몸 굵기 */
  body: number;
  tone: LineTone;
  /** 선 아래 바탕색. 선 몸 · 속선은 이 위에 쌓은 것과 같은 불투명 색으로 그려 띠 이음매가 비치지 않는다 */
  ground: string;
  /** 그라데이션 id 접미사(한 화면에서 겹치지 않게) */
  id: string;
  /** 띠 경계(0~1). 없으면 8등분 */
  stops?: number[];
  /** 띠마다 곱할 불투명도(공유 이미지의 잘린 끝 흐림) */
  fade?: (t: number) => number;
  /** 빛(바깥 · 안쪽) 굵기 배율. 작은 그림에서 줄여 가까운 길끼리 번짐이 붙지 않게 */
  halo?: number;
  /** 점 격자 위면 선 아래를 바탕색으로 지운다 */
  knock?: boolean;
  /** 다른 색으로 그릴 길이 범위(px, 정렬)와 그 색 — 공유 이미지 「처음 달린 길」 민트 */
  alt?: { ranges: [number, number][]; tone: LineTone };
  /** 출발 표시(조용한 작은 고리). 없으면 출발 끝만 둥글게 */
  start?: boolean;
  /** 끝 점(지금 위치 · 도착)의 빛 머리. mini는 속과 작은 번짐만(테 없음) */
  head?: 'full' | 'mini';
  /** 빛 머리 번짐 반지름 */
  bloom?: number;
  /** km 빛 알갱이 자리 */
  km?: Pt[];
}

/**
 * 경로 선 v2(react-native-svg). 같은 색 구간은 한 Path에 이어 그려 구슬처럼 끊기지 않는다:
 * 선 몸은 띠마다 한 Path(불투명 섞은 색), 빛은 불투명도 단계마다 한 Path. <Svg> 안에 넣는다. 점은 이미 매끈하게 한 것이어야 한다
 */
export function RouteLine({ pts, body, tone, ground, id, stops, fade, halo = 1, knock, alt, start, head, bloom = 16, km }: Props) {
  if (pts.length < 2) return null;
  const c = cumLen(pts);
  const T = c[c.length - 1];
  const V = LINE_V2;
  const d = (ranges: [number, number][], seam = 0) => ranges.map(([a, b]) => pathD(sliceLen(pts, c, a, Math.min(T, b + seam)))).join('');
  const bands = bandStyles(body, { stops: stops ?? evenStops() }).map((s) => {
    const a = T * s.t0;
    const b = T * s.t1;
    const f = fade ? fade((s.t0 + s.t1) / 2) : 1;
    const split = alt ? splitRanges(a, b, alt.ranges) : { inside: [], outside: [[a, b] as [number, number]] };
    const ops = { outerOp: s.outerOp * f, innerOp: s.innerOp * f, bodyOp: s.bodyOp * f };
    return { s, f, ops, split, all: d([[a, b]]) };
  });
  const line = (key: string, path: string, color: string, width: number, opacity: number) =>
    path ? <Path key={key} d={path} stroke={color} strokeWidth={width} strokeOpacity={opacity} strokeLinecap="butt" strokeLinejoin="round" fill="none" /> : null;
  const kinds: [string, LineTone, (i: number) => [number, number][]][] = [
    ['', tone, (i) => bands[i].split.outside],
    ...(alt ? [['a', alt.tone, (i: number) => bands[i].split.inside] as [string, LineTone, (i: number) => [number, number][]]] : []),
  ];
  // 선 몸: 띠마다 불투명하게 섞은 색 + 다음 띠 밑으로 SEAM 겹침
  const bodyLayer = bands.flatMap(({ s, ops }, i) => kinds.map(([k, t, pieces]) => line(`b${i}${k}`, d(pieces(i), SEAM), solidBody(t, ground, ops), s.bodyW, 1)));
  // 빛(반투명): 띠마다 따로 그리면 맞댄 끝끼리 만나는 곳에 가는 틈이 보여서, 불투명도 계단으로 겹쳐 그린다 —
  // 단계마다 「그 불투명도 이상인 띠」를 이어 한 Path로, 늘어난 만큼만. 이음매에는 시작하는 끝 하나만 있다
  const glow = (name: 'outer' | 'inner') => kinds.flatMap(([k, t, pieces]) => {
    const q = name === 'outer' ? 0.01 : 0.015;
    const ops = bands.map((b) => Math.round((name === 'outer' ? b.ops.outerOp : b.ops.innerOp) / q) * q);
    let prev = 0;
    return [...new Set(ops.filter((o) => o > 0))].sort((a, b) => a - b).map((level, j) => {
      const a = 1 - (1 - level) / (1 - prev);
      prev = level;
      const ranges = ops.flatMap((o, i) => (o >= level - 1e-9 ? pieces(i) : [])).reduce<[number, number][]>((out, r) => {
        const last = out[out.length - 1];
        if (last && Math.abs(last[1] - r[0]) < 1e-6) last[1] = r[1];
        else out.push([r[0], r[1]]);
        return out;
      }, []);
      const w = (name === 'outer' ? bands[0].s.outerW : bands[0].s.innerW) * halo;
      return line(`${name[0]}${k}${j}`, d(ranges), name === 'outer' ? t.outer : t.body, w, a);
    });
  });
  const tl = Math.min(T, V.core.len);
  const first = pts[0];
  const end = pts[pts.length - 1];
  const startTone = alt && alt.ranges.length > 0 && alt.ranges[0][0] <= 0 ? alt.tone : tone;
  const last = bands[bands.length - 1];
  const headBody = solidBody(alt && alt.ranges.some(([, b]) => b >= T) ? alt.tone : tone, ground, last.ops);
  const r = V.km.r;
  const grains = (km ?? []).map(([x, y]) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`).join('');
  const gid = `lv2b${id}`;

  return (
    <>
      {knock && (fade
        ? bands.map(({ f, all }, i) => <Path key={`k${i}`} d={all} stroke={ground} strokeWidth={knockWidth(body)} strokeOpacity={V.knock.op * f} strokeLinecap="round" strokeLinejoin="round" fill="none" />)
        : <Path d={pathD(pts)} stroke={ground} strokeWidth={knockWidth(body)} strokeOpacity={V.knock.op} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
      {glow('outer')}
      {glow('inner')}
      {bodyLayer}
      {!start && <Circle cx={first[0]} cy={first[1]} r={bands[0].s.bodyW / 2} fill={solidBody(startTone, ground, bands[0].ops)} />}
      {head && coreSteps().map((k, j) => line(`c${j}`, pathD(sliceLen(pts, c, T - tl + tl * k.f0, Math.min(T, T - tl + tl * k.f1 + SEAM))), mixHex(tone.core, headBody, k.op), body * V.core.mul, 1))}
      {grains ? <Path d={grains} fill={tone.core} fillOpacity={V.km.op} /> : null}
      {start && <Circle cx={first[0]} cy={first[1]} r={V.start.r} fill={ground} stroke={tone.body} strokeOpacity={V.start.op} strokeWidth={V.start.w} />}
      {head && (
        <>
          <Defs>
            <RadialGradient id={gid}>
              <Stop offset="0" stopColor={tone.body} stopOpacity={V.head.bloomIn} />
              <Stop offset={String(V.head.bloomMid)} stopColor={tone.outer} stopOpacity={V.head.bloomMidOp} />
              <Stop offset="1" stopColor={tone.outer} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={end[0]} cy={end[1]} r={bloom} fill={`url(#${gid})`} />
          {head === 'full' && <Circle cx={end[0]} cy={end[1]} r={V.head.ring} fill="none" stroke={tone.body} strokeOpacity={V.head.ringOp} strokeWidth={V.head.ringW} />}
          <Circle cx={end[0]} cy={end[1]} r={head === 'full' ? V.head.core : V.head.core * 0.45} fill={tone.head} />
        </>
      )}
    </>
  );
}
