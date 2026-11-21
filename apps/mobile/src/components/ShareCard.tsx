import { forwardRef, type ComponentRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';
import { palettes } from '@/theme/colors';
import { FONT, monoLabel } from '@/theme/fonts';
import { fitToBox, type LngLat } from '@/utils/route';
import { formatDuration, formatRunPace } from '@/utils/pace';
import { formatClock, formatDay } from '@/utils/date';

/** 공유 이미지 크기(뷰 360×640, 캡처는 3배 1080×1920 — 9:16 스토리) */
export const SHARE_W = 360;
export const SHARE_H = 640;

// 브랜드 얼굴은 하나: 테마와 상관없이 다크 Frost
const p = palettes.dark;
const MINT = p.fresh;
// 코스가 들어가는 칸(위 머리줄과 아래 기록 묶음 사이)
const MAP_TOP = 96;
const MAP_H = 330;
// 잘린 끝이 흐려지는 길이(구간 수 비율)
const FADE = 0.1;

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
 * 아래: 「● ○○동 · 처음 달린 길 x km」(없으면 「늘 뛰던 길」) / 거리 / TIME · PACE
 */
export const ShareCard = forwardRef<ComponentRef<typeof View>, { data: ShareCardData }>(function ShareCard({ data }, ref) {
  const pts = data.route.length > 1 ? fitToBox(data.route, SHARE_W, MAP_H, 44) : [];
  const n = pts.length - 1;
  const fadeN = Math.max(1, Math.round(n * FADE));
  const seg = (i: number) => `M${pts[i][0].toFixed(1)} ${(pts[i][1] + MAP_TOP).toFixed(1)}L${pts[i + 1][0].toFixed(1)} ${(pts[i + 1][1] + MAP_TOP).toFixed(1)}`;
  // 끝으로 갈수록 옅어진다(남은 경로 안쪽에서만 — 잘린 100m 쪽으로 늘리지 않는다)
  const alpha = (i: number) => {
    const edge = Math.min(i, n - 1 - i);
    return edge >= fadeN ? 1 : 0.2 + 0.8 * (edge / fadeN);
  };
  const showFirst = data.firstKm > 0;
  const line = showFirst ? `처음 달린 길 ${data.firstKm.toFixed(1)} km` : '늘 뛰던 길';

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
        {Array.from({ length: Math.max(0, n) }, (_, i) => (
          <Path key={`b${i}`} d={seg(i)} stroke={p.map.dot} strokeOpacity={0.95 * alpha(i)} strokeWidth={4} strokeLinecap="round" fill="none" />
        ))}
        {showFirst && Array.from({ length: Math.max(0, n) }, (_, i) => (data.first[i] ? (
          <Path key={`m${i}`} d={seg(i)} stroke={MINT} strokeOpacity={alpha(i)} strokeWidth={4.6} strokeLinecap="round" fill="none" />
        ) : null))}
      </Svg>

      <Text style={styles.head}>{`STRIDE+ · ${formatDay(data.createdAt)} · ${formatClock(data.createdAt)}`}</Text>

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
  head: { position: 'absolute', top: 92 - 28, left: 28, right: 28, ...monoLabel(10, 0.12), color: p.muted },
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
