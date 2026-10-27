import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View, Text, Pressable, Image, FlatList, RefreshControl, ActivityIndicator, StyleSheet, Animated,
} from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertIcon, RouteIcon } from '@/components/icons';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';
import type { RunMarker } from '../RunCard';
import { formatDuration, formatPace } from '@/utils/pace';
import { formatDay } from '@/utils/date';
import { fitToBox } from '@/utils/route';
import { MOTION, easeOutCubic, useReducedMotion } from '@/utils/motion';

export interface RunWithRoute extends RunMarker {
  route: [number, number][];
}

export type ListState = 'loading' | 'error' | 'ready';

interface Props {
  runs: RunWithRoute[];
  state: ListState;
  baseUrl: string;
  mine: boolean;
  /** 전체 러닝 수(서버 누적). 「27 RUNS · LATEST」 */
  totalRuns: number | null;
  /** 방금 저장한 러닝 — 그 기록이 히어로면 File 전환으로 들어온다 */
  filedRunId?: string;
  refreshing: boolean;
  loadingMore: boolean;
  topInset: number;
  bottomInset: number;
  onRefresh: () => void;
  onEndReached: () => void;
  onRetry: () => void;
  onRunPress: (runId: string) => void;
  onStartRun: () => void;
}

const THUMB = 52;
const HERO_HEIGHT = 280;
const WHITE = '#FFFFFF';

const titleOf = (run: RunMarker) => run.description?.trim() || '러닝 기록';
const timeOf = (run: RunMarker) => (run.paceSecPerKm && run.distanceKm ? formatDuration(run.paceSecPerKm * run.distanceKm) : '--:--');

// 격자(간격 cell) 위 경로 선. 썸네일·히어로가 같이 쓴다
function RouteOnGrid({ route, size, cell, stroke, grid, inset }: {
  route: [number, number][]; size: [number, number]; cell: number; stroke: string; grid: string; inset: number;
}) {
  const [w, h] = size;
  const d = useMemo(() => {
    let g = '';
    for (let x = 0; x <= w; x += cell) g += `M${x + 0.5} 0V${h}`;
    for (let y = 0; y <= h; y += cell) g += `M0 ${y + 0.5}H${w}`;
    return g;
  }, [w, h, cell]);
  const pts = useMemo(() => fitToBox(route, w, h, inset), [route, w, h, inset]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Path d={d} stroke={grid} strokeWidth={1} fill="none" />
      {pts.length > 1 && (
        <>
          <Polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={pts[0][0]} cy={pts[0][1]} r={2.6} fill="none" stroke={stroke} strokeWidth={1.6} />
          <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.6} fill={stroke} />
        </>
      )}
    </Svg>
  );
}

// 최신 기록 히어로: 코스·날짜 / 거리 64 / 시간·페이스.
// 사진이 있으면 사진 + 아래 어두운 스크림 + 흰 글자, 오른쪽 위 유리 상자에 경로.
// 사진이 없으면 테마 카드(surface) 위 격자 + 경로, 스크림 없이 테마 글자색
// File(520ms): 요약 화면에서 접혀 들어오듯 위에서 살짝 크게 시작해 제자리로
function FileIn({ active, children }: { active: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const p = useRef(new Animated.Value(active ? 0 : 1)).current;
  useEffect(() => {
    if (!active) return;
    Animated.timing(p, { toValue: 1, duration: reduced ? MOTION.reduced : MOTION.file, easing: easeOutCubic, useNativeDriver: true }).start();
  }, [active, reduced, p]);
  const style = reduced
    ? { opacity: p }
    : {
      opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
      transform: [
        { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
        { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) },
      ],
    };
  return <Animated.View style={style}>{children}</Animated.View>;
}

function Hero({ run, baseUrl, c, styles, onPress }: {
  run: RunWithRoute; baseUrl: string; c: Palette; styles: ReturnType<typeof makeStyles>; onPress: () => void;
}) {
  const photo = run.photoUrls[0];
  const pace = formatPace(run.paceSecPerKm);
  const time = timeOf(run);
  const [width, setWidth] = useState(350);
  const icon = photo ? WHITE : c.text2;
  return (
    <Pressable
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={`최근 러닝 ${titleOf(run)}, ${formatDay(run.createdAt)}, ${run.distanceKm.toFixed(2)} km, 시간 ${time}, 페이스 ${pace}`}
      onPress={onPress}
      style={styles.hero}
    >
      {photo ? (
        <Image source={{ uri: `${baseUrl}${photo}` }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.heroPlain]}>
          <RouteOnGrid route={run.route} size={[width, HERO_HEIGHT]} cell={24} stroke={c.value} grid={c.grid} inset={48} />
        </View>
      )}
      {photo && (
        <LinearGradient
          colors={['rgba(11,16,22,0)', 'rgba(11,16,22,0.65)', 'rgba(11,16,22,0.88)']}
          locations={[0, 0.25, 1]}
          style={styles.heroShade}
          pointerEvents="none"
        />
      )}
      {photo && (
        <View style={styles.heroBadge} pointerEvents="none">
          <RouteOnGrid route={run.route} size={[58, 58]} cell={58} stroke={WHITE} grid="transparent" inset={10} />
        </View>
      )}
      <View style={styles.heroText} pointerEvents="none">
        <View style={styles.heroTitleRow}>
          <Text style={[styles.heroTitle, !photo && styles.heroTitlePlain]} numberOfLines={1}>{titleOf(run)}</Text>
          <Text style={[styles.heroDate, !photo && styles.heroDatePlain]}>{formatDay(run.createdAt)}</Text>
        </View>
        <View style={styles.heroDistRow}>
          <Text style={[styles.heroDist, !photo && styles.heroDistPlain]}>{run.distanceKm.toFixed(2)}</Text>
          <Text style={[styles.heroKm, !photo && styles.heroKmPlain]}>km</Text>
        </View>
        <View style={styles.heroMinor}>
          <View style={styles.heroMinorItem}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={icon} strokeWidth={2} strokeLinecap="round">
              <Circle cx={12} cy={13.5} r={7.5} />
              <Path d="M12 13.5V10M9.5 2.5h5" />
            </Svg>
            <Text style={[styles.heroMinorText, !photo && styles.heroMinorTextPlain]}>{time}</Text>
          </View>
          <View style={styles.heroMinorItem}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={icon} strokeWidth={2} strokeLinecap="round">
              <Path d="M4 17a8 8 0 0 1 16 0" />
              <Path d="m12 17 4-5" />
            </Svg>
            <Text style={[styles.heroMinorText, !photo && styles.heroMinorTextPlain]}>
              {pace}
              <Text style={[styles.heroMinorUnit, !photo && styles.heroMinorUnitPlain]}>/km</Text>
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function RunItem({ run, baseUrl, c, styles, latest, onPress }: {
  run: RunWithRoute; baseUrl: string; c: Palette; styles: ReturnType<typeof makeStyles>; latest: boolean; onPress: () => void;
}) {
  const date = formatDay(run.createdAt);
  const photo = run.photoUrls[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titleOf(run)}, ${date} 러닝 ${run.distanceKm.toFixed(2)} km, 페이스 ${formatPace(run.paceSecPerKm)}, 시간 ${timeOf(run)}${run.photoUrls.length ? `, 사진 ${run.photoUrls.length}장` : ''}`}
      onPress={onPress}
      // 함수형 style은 NativeWind interop에서 적용되지 않아 정적 style을 쓴다
      style={[styles.row, latest && styles.rowLatest]}
    >
      <View style={styles.thumb}>
        {photo ? (
          <Image source={{ uri: `${baseUrl}${photo}` }} style={StyleSheet.absoluteFill} />
        ) : (
          <RouteOnGrid route={run.route} size={[THUMB, THUMB]} cell={9} stroke={c.map.dot} grid={c.dark ? 'rgba(157,191,224,0.08)' : 'rgba(36,71,107,0.08)'} inset={9} />
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>{titleOf(run)}</Text>
        <Text style={[styles.date, latest && styles.dateLatest]}>{date}</Text>
      </View>
      <Text style={styles.distance}>
        {run.distanceKm.toFixed(1)}
        <Text style={[styles.distanceUnit, latest && styles.dateLatest]}> km</Text>
      </Text>
    </Pressable>
  );
}

// Frost S08/S09 목록 보기 — 최신 기록 히어로 + 「러닝 앨범」 72px 줄 + 로딩·빈·오류·새로고침·다음 페이지 상태
export function RunList(props: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { runs, state, mine, topInset, bottomInset, totalRuns } = props;
  const contentStyle = { paddingTop: topInset + 4, paddingBottom: bottomInset, paddingHorizontal: 20, gap: 8 };

  if (state === 'loading') {
    return (
      <View accessibilityLabel="러닝 기록을 불러오는 중" style={contentStyle}>
        <View style={[styles.hero, styles.skeletonHero]}>
          <View style={[styles.skeleton, styles.skeletonBadge]} />
          <View style={styles.skeletonHeroText}>
            <View style={[styles.skeleton, { width: 150, height: 16 }]} />
            <View style={[styles.skeleton, { width: 170, height: 56, borderRadius: 12 }]} />
            <View style={[styles.skeleton, { width: 160, height: 16 }]} />
          </View>
        </View>
        <View style={[styles.skeleton, { width: 92, height: 16, marginBottom: 8 }]} />
        {[1, 0.8, 0.6, 0.4].map((opacity) => (
          <View key={opacity} style={[styles.row, { opacity }]}>
            <View style={[styles.skeleton, { width: THUMB, height: THUMB, borderRadius: 12 }]} />
            <View style={[styles.rowBody, { gap: 8 }]}>
              <View style={[styles.skeleton, { width: 120, height: 14 }]} />
              <View style={[styles.skeleton, { width: 72, height: 12 }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (state === 'error' || runs.length === 0) {
    const isError = state === 'error';
    return (
      <View accessibilityRole={isError ? 'alert' : undefined} style={[styles.center, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <View style={styles.stateIcon}>
          {isError ? <AlertIcon size={28} color={c.text2} /> : <RouteIcon size={28} color={c.text2} />}
        </View>
        <Text style={styles.stateTitle}>{isError ? '불러오지 못했어요' : '아직 러닝 기록이 없어요'}</Text>
        {isError ? (
          <Pressable accessibilityRole="button" onPress={props.onRetry} style={styles.ghostBtn}>
            <Text style={styles.ghostText}>다시 시도</Text>
          </Pressable>
        ) : mine ? (
          <Pressable accessibilityRole="button" onPress={props.onStartRun} style={styles.accentBtn}>
            <Text style={styles.accentText}>첫 러닝 시작하기</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const count = totalRuns ?? runs.length;
  return (
    <FlatList
      accessibilityLabel="러닝 기록"
      data={runs}
      keyExtractor={(run) => run._id}
      ListHeaderComponent={
        <View>
          <FileIn key={runs[0]._id} active={!!props.filedRunId && props.filedRunId === runs[0]._id}>
            <Hero run={runs[0]} baseUrl={props.baseUrl} c={c} styles={styles} onPress={() => props.onRunPress(runs[0]._id)} />
          </FileIn>
          <View style={styles.albumHead}>
            <Text accessibilityRole="header" style={styles.albumTitle}>러닝 앨범</Text>
            <Text style={styles.albumCount}>{`${count} RUNS · LATEST`}</Text>
          </View>
        </View>
      }
      renderItem={({ item, index }) => (
        <RunItem run={item} baseUrl={props.baseUrl} c={c} styles={styles} latest={index === 0} onPress={() => props.onRunPress(item._id)} />
      )}
      contentContainerStyle={contentStyle}
      refreshControl={
        <RefreshControl
          refreshing={props.refreshing}
          onRefresh={props.onRefresh}
          tintColor={c.value}
          colors={[c.value]}
          progressViewOffset={topInset}
        />
      }
      onEndReached={props.onEndReached}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        props.loadingMore ? (
          <View accessibilityLabel="다음 기록 불러오는 중" style={styles.footer}>
            <ActivityIndicator color={c.value} />
          </View>
        ) : undefined
      }
    />
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  hero: {
    height: HERO_HEIGHT, marginBottom: 12, borderRadius: 20, overflow: 'hidden',
    shadowColor: c.shadow, shadowOpacity: c.dark ? 0.4 : 0.14, shadowRadius: 13, shadowOffset: { width: 0, height: 10 }, elevation: 6,
  },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 170 },
  heroBadge: {
    position: 'absolute', right: 14, top: 14, width: 60, height: 60, borderRadius: 14,
    backgroundColor: 'rgba(157,191,224,0.14)', borderWidth: 1, borderColor: 'rgba(220,230,238,0.28)', overflow: 'hidden',
  },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 14 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroTitle: { flexShrink: 1, fontFamily: FONT.semibold, fontSize: 17, lineHeight: 22, color: WHITE },
  heroDate: { ...monoLabel(12.5, 0.04), lineHeight: 20, color: WHITE },
  heroDistRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  heroDist: { fontFamily: FONT.num, fontSize: 64, lineHeight: 66, letterSpacing: -0.6, color: WHITE },
  heroKm: { fontFamily: FONT.regular, fontSize: 18, color: 'rgba(255,255,255,0.78)' },
  heroMinor: { marginTop: 2, flexDirection: 'row', gap: 16 },
  heroMinorItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMinorText: { fontFamily: FONT.num, fontSize: 16, lineHeight: 22, color: WHITE },
  heroMinorUnit: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  // 사진 없는 히어로: 테마 카드 위 테마 글자색(스크림 없음)
  heroPlain: { backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border },
  heroTitlePlain: { color: c.text },
  heroDatePlain: { color: c.text2 },
  heroDistPlain: { color: c.text },
  // 팔레트 토큰 이름이 value라 인라인 { color: c.value }는 reanimated 플러그인이 shared value로 오인해 경고한다 → StyleSheet로
  heroKmPlain: { color: c.value },
  heroMinorTextPlain: { color: c.text },
  heroMinorUnitPlain: { color: c.text2 },
  albumHead: { height: 24, marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  albumTitle: { fontFamily: FONT.bold, fontSize: 18, lineHeight: 24, color: c.text },
  albumCount: { ...monoLabel(10.5, 0.14), lineHeight: 24, color: c.navOff },
  row: {
    height: 72, paddingLeft: 12, paddingRight: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  rowLatest: { backgroundColor: c.surface2, borderWidth: 1.5, borderColor: c.value },
  thumb: { width: THUMB, height: THUMB, borderRadius: 12, overflow: 'hidden', backgroundColor: c.surface2 },
  rowBody: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22, color: c.text },
  date: { ...monoLabel(12, 0.04), lineHeight: 18, color: c.navOff },
  dateLatest: { color: c.text2 },
  // 팔레트 토큰 이름이 value라 인라인 { color: c.value }는 reanimated 플러그인이 shared value로 오인해 경고한다 → StyleSheet로
  distance: { fontFamily: FONT.num, fontSize: 22, lineHeight: 26, color: c.value },
  distanceUnit: { fontFamily: FONT.num, fontSize: 13, color: c.navOff },
  skeleton: { height: 12, borderRadius: 6, backgroundColor: c.surface2 },
  skeletonHero: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, shadowOpacity: 0, elevation: 0 },
  skeletonBadge: { position: 'absolute', right: 14, top: 14, width: 60, height: 60, borderRadius: 14 },
  skeletonHeroText: { position: 'absolute', left: 18, bottom: 18, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  stateIcon: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  stateTitle: { marginTop: 4, fontFamily: FONT.semibold, fontSize: 17, lineHeight: 24, color: c.text },
  accentBtn: { marginTop: 8, height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: c.accent, justifyContent: 'center' },
  accentText: { fontFamily: FONT.semibold, fontSize: 15, color: c.ink },
  ghostBtn: {
    marginTop: 8, height: 48, paddingHorizontal: 24, borderRadius: 24, justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  ghostText: { fontFamily: FONT.semibold, fontSize: 15, color: c.text },
  footer: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
