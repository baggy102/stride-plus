import { forwardRef, type ComponentRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { palettes } from '@/theme/colors';
import { FONT, monoLabel } from '@/theme/fonts';
import { fitToBox, type LngLat } from '@/utils/route';
import { boxSmooth, flagRanges, smoothRoute, valueAtSource } from '@/utils/routeSmooth';
import { cumLen, lineTone, type Pt } from '@/utils/routeLine';
import { formatDuration, formatRunPace } from '@/utils/pace';
import { formatClock, formatDay } from '@/utils/date';
import { RouteLine } from './RouteLine';
import { Wordmark } from './Wordmark';

/** 공유 이미지 크기(뷰 360×640, 캡처는 3배 1080×1920 — 9:16 스토리) */
export const SHARE_W = 360;
export const SHARE_H = 640;

// 브랜드 얼굴은 하나: 테마와 상관없이 다크 Frost
const p = palettes.dark;
const MINT = p.fresh;
// 코스가 들어가는 칸(위 머리줄과 아래 기록 묶음 사이)
const MAP_TOP = 96;
const MAP_H = 330;
// 잘린 끝이 흐려지는 길이(경로 길이 비율)
const FADE = 0.1;
// 선 몸 굵기(경로 선 v2). 띠 경계: 큰 그림(1080×1920 캡처)이라 지도(8띠)보다 잘게 — 흐려지는 양 끝 10%는 1.25%씩, 가운데는 5%씩(띠 32개).
// 한 번 그려 캡처하는 화면 밖 그림이라 Path 수(띠 · 빛 단계, 120개 안팎 — 예전 구간마다 그리던 700개 안팎보다 적다)는 부담이 없다
const BODY = 3.4;
const STOPS = [
  ...Array.from({ length: 8 }, (_, i) => i * 0.0125),
  ...Array.from({ length: 16 }, (_, i) => 0.1 + i * 0.05),
  ...Array.from({ length: 8 }, (_, i) => 0.9 + i * 0.0125),
  1,
];
const endFade = (t: number) => {
  const edge = Math.min(t, 1 - t);
  return edge >= FADE ? 1 : 0.2 + 0.8 * (edge / FADE);
};

export interface ShareCardData {
  /** 출발·도착 100m를 자른 경로 */
  route: LngLat[];
  /** route 구간별 처음 달린 길 여부(route.length - 1) */
  first: boolean[];
  /** 처음 달린 길(km). FIRST_RUN_MIN_KM 미만이면 0으로 넘긴다 */
  firstKm: number;
  place: string | null;
  distanceKm: number;
  paceSecPerKm: number;
  createdAt: string;
}

/**
 * 저장 직후 공유 이미지(9:16, 2026-11-21 브랜딩 4차 · 사용자 「내 코스와 기록이 나와야」).
 * 점 격자 도면 위 내 코스(Ice, 처음 달린 구간만 민트) — 출발·도착 100m는 잘려 오고, 잘린 끝은 흐려지며 출발·도착 표시는 없다.
 * 선은 경로 선 v2(2026-11-24): 매끈하게 한 사본을 띠 × 층마다 한 Path로(같은 색 구간은 이어서 — 구슬 없음), 도착 쪽으로 밝아지고,
 * 선 아래 점 격자는 지운다. 머리 표시가 없어(잘린 끝) 격자를 밝히는 빛 둘레는 쓰지 않는다
 * 위: 워드마크 그림(로고색, 앱 머리와 같은 폭 71) + 「11.22 일 · 07:05」
 * 아래: 「● ○○동 · 처음 달린 길 x km」(없으면 「늘 달리던 길」) / 거리 / TIME · PACE
 */
export const ShareCard = forwardRef<ComponentRef<typeof View>, { data: ShareCardData }>(function ShareCard({ data }, ref) {
  const showFirst = data.firstKm > 0;
  const drawn = data.route.length > 1 ? smoothRoute(data.route, boxSmooth(data.route, SHARE_W, MAP_H, 44)) : null;
  const pts: Pt[] = drawn ? fitToBox(drawn.pts, SHARE_W, MAP_H, 44).map(([x, y]) => [x, y + MAP_TOP]) : [];
  // 처음 달린 구간(원래 구간 번호) → 그린 선의 길이 범위. 어느 구간이 처음인지는 그대로(firstRunFlags)
  const cum = cumLen(pts);
  const firstRanges = drawn && showFirst
    ? flagRanges(data.first).map(([u0, u1]): [number, number] => [valueAtSource(cum, drawn.src, u0), valueAtSource(cum, drawn.src, u1)])
    : [];
  const line = showFirst ? `처음 달린 길 ${data.firstKm.toFixed(1)} km` : '늘 달리던 길';

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Svg width={SHARE_W} height={SHARE_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="grid" width={11} height={11} patternUnits="userSpaceOnUse">
            <Circle cx={5.5} cy={5.5} r={0.9} fill={p.muted} fillOpacity={0.3} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={SHARE_W} height={SHARE_H} fill={p.bg} />
        <Rect x={0} y={MAP_TOP - 20} width={SHARE_W} height={MAP_H + 40} fill="url(#grid)" />
        <RouteLine
          pts={pts}
          body={BODY}
          tone={lineTone(p)}
          ground={p.bg}
          id="share"
          stops={STOPS}
          fade={endFade}
          knock
          alt={firstRanges.length ? { ranges: firstRanges, tone: lineTone(p, MINT) } : undefined}
        />
      </Svg>

      {/* 로고 자리는 글자 「STRIDE+」가 아니라 워드마크 그림(TERMS #53) */}
      <View style={styles.head}>
        <Wordmark width={71} color={p.logo} />
        <Text style={styles.headText}>{`${formatDay(data.createdAt)} · ${formatClock(data.createdAt)}`}</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.placeRow}>
          <View style={[styles.dot, { backgroundColor: showFirst ? MINT : p.map.dot }]} />
          <Text style={styles.place} numberOfLines={1}>{data.place ? `${data.place} · ${line}` : line}</Text>
        </View>
        <View style={styles.kmRow}>
          <Text style={styles.km}>{data.distanceKm.toFixed(2)}</Text>
          <Text style={styles.kmUnit}>KM</Text>
        </View>
        <View style={styles.stats}>
          <Text style={styles.stat}>{formatDuration(data.paceSecPerKm * data.distanceKm)}<Text style={styles.statLabel}>  TIME</Text></Text>
          <Text style={styles.stat}>{formatRunPace(data.paceSecPerKm, data.distanceKm)}<Text style={styles.statLabel}>  PACE</Text></Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: SHARE_W, height: SHARE_H, backgroundColor: p.bg, overflow: 'hidden' },
  // 스토리 앱 UI가 위 약 14%를 가리므로 그 아래에서 시작
  head: { position: 'absolute', top: 92 - 28, left: 28, right: 28, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headText: { ...monoLabel(10, 0.12), lineHeight: 14, color: p.muted },
  bottom: { position: 'absolute', left: 28, right: 28, top: MAP_TOP + MAP_H + 4, gap: 6 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  place: { flex: 1, fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20, color: p.text },
  kmRow: { flexDirection: 'row', alignItems: 'baseline' },
  km: { fontFamily: FONT.numCondensedBold, fontSize: 72, lineHeight: 76, letterSpacing: -2, color: p.text, transform: [{ skewX: '-8deg' }] },
  kmUnit: { ...monoLabel(14, 0.08), marginLeft: 6, color: p.value },
  stats: { flexDirection: 'row', gap: 22 },
  stat: { fontFamily: FONT.num, fontSize: 17, lineHeight: 22, color: p.text },
  statLabel: { ...monoLabel(10, 0.1), color: p.muted },
});
