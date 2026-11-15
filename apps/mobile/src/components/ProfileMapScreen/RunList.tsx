import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View, Text, Pressable, RefreshControl, ActivityIndicator, StyleSheet, Animated as RNAnimated, type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  runOnJS, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertIcon, RouteIcon } from '@/components/icons';
import { CARD_FULL, CARD_HEAD, CARD_RADIUS, CollapsedRow, ExpandedCard, titleOf, type FeedRun } from '@/components/FeedCard';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import { withAlpha, type Palette } from '@/theme/colors';
import type { RunMarker } from '@/types/run';
import { formatDate } from '@/utils/date';
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
  /** 방금 저장한 러닝 — 그 기록이 맨 위면 File 전환으로 들어온다 */
  filedRunId?: string;
  refreshing: boolean;
  loadingMore: boolean;
  topInset: number;
  bottomInset: number;
  onRefresh: () => void;
  onEndReached: () => void;
  onRetry: () => void;
  /** top = 누른 펼친 카드의 화면 y(상세가 그 자리에서 열린다) */
  onRunPress: (runId: string, top: number) => void;
  onStartRun: () => void;
}

// 매거진형(2026-11-15 확정 시안 16차): 펼친 카드 1장 + 접힌 한 줄, 스크롤 한 칸(STEP)마다 멈춤
const GAP = 6;
const PEEK = 7; // 지나간 카드가 위에 겹쳐 보이는 두께
const STEP = 300;
const SIDE = 10;

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

// p = 펼쳐진 카드 위치(0 ~ n-1, 소수면 두 카드 사이). 카드 k의 높이 · 위치 · 접힘 정도
export function cardLayout(k: number, p: number, n: number, y0: number) {
  'worklet';
  const pos = Math.max(0, Math.min(n - 1, p));
  let f = Math.floor(pos);
  let t = pos - f;
  if (f >= n - 1) { f = n - 1; t = 0; }
  const hOf = (j: number) => CARD_HEAD + (CARD_FULL - CARD_HEAD) * clamp01(1 - Math.abs(j - pos));
  const yf = f === 0 ? y0 : y0 + (CARD_HEAD + GAP) * (1 - t);
  let y = yf;
  if (k > f) {
    y = yf + hOf(f) + GAP;
    if (k > f + 1) y += hOf(f + 1) + GAP + (k - f - 2) * (CARD_HEAD + GAP);
  } else if (k < f) {
    y = yf - (f - k) * (CARD_HEAD + GAP);
  }
  let top = y;
  let scale = 1;
  let behind = 0; // 위로 지나간 정도(카드 칸 수)
  if (top < y0) {
    behind = (y0 - top) / (CARD_HEAD + GAP);
    const b = Math.min(behind, 2);
    top = y0 - PEEK * b;
    scale = 1 - 0.045 * b;
  }
  return { height: hOf(k), top, scale, behind, open: clamp01(1 - Math.abs(k - pos)) };
}

// File(520ms): 요약 화면에서 접혀 들어오듯 위에서 살짝 크게 시작해 제자리로
function FileIn({ active, children }: { active: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const p = useRef(new RNAnimated.Value(active ? 0 : 1)).current;
  useEffect(() => {
    if (!active) return;
    RNAnimated.timing(p, { toValue: 1, duration: reduced ? MOTION.reduced : MOTION.file, easing: easeOutCubic, useNativeDriver: true }).start();
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
  return <RNAnimated.View style={style}>{children}</RNAnimated.View>;
}

function MagazineCard({ run, index, count, scrollY, y0, width, liveMap, filed, baseUrl, dimColor, dimMax, styles, onPress }: {
  run: RunWithRoute; index: number; count: number; scrollY: SharedValue<number>; y0: number; width: number;
  liveMap: boolean; filed: boolean; baseUrl: string; dimColor: string; dimMax: number;
  styles: ReturnType<typeof makeStyles>; onPress: () => void;
}) {
  const cardStyle = useAnimatedStyle(() => {
    const l = cardLayout(index, scrollY.value / STEP, count, y0);
    return {
      height: l.height,
      opacity: l.behind > 2.5 ? 0 : 1,
      transform: [{ translateY: l.top }, { scaleX: l.scale }],
    };
  });
  // 펼친 내용은 흐리지 않고 카드 높이로만 잘라 보인다. 한 줄은 펼치기 시작할 때만 교차
  const rowStyle = useAnimatedStyle(() => {
    const l = cardLayout(index, scrollY.value / STEP, count, y0);
    return { opacity: clamp01(1 - l.open * 5) * (1 - clamp01(l.behind)) };
  });
  const fullStyle = useAnimatedStyle(() => {
    const l = cardLayout(index, scrollY.value / STEP, count, y0);
    return { opacity: clamp01((l.open - 0.12) / 0.2) };
  });
  const dimStyle = useAnimatedStyle(() => {
    const l = cardLayout(index, scrollY.value / STEP, count, y0);
    return { opacity: Math.min(l.behind, 2) * dimMax };
  });
  return (
    <Animated.View style={[styles.card, { zIndex: index + 1 }, cardStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${titleOf(run)}, ${formatDate(run.createdAt)}, ${run.distanceKm.toFixed(2)} km`}
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      >
        <Animated.View style={[styles.layer, fullStyle]}>
          <FileIn active={filed}>
            <ExpandedCard run={run as FeedRun} baseUrl={baseUrl} liveMap={liveMap} width={width} />
          </FileIn>
        </Animated.View>
        <Animated.View style={[styles.layer, rowStyle]}>
          <CollapsedRow run={run as FeedRun} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dimColor }, dimStyle]} />
      </Pressable>
    </Animated.View>
  );
}

// Frost S08/S09 목록 보기 — 매거진형 + 로딩·빈·오류·새로고침·다음 페이지 상태
export function RunList(props: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { runs, state, mine, topInset, bottomInset } = props;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [current, setCurrent] = useState(0);
  const scrollY = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const n = runs.length;
  const y0 = topInset + 10;
  const cardWidth = Math.max(0, size.width - SIDE * 2);

  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  useAnimatedReaction(
    () => Math.round(Math.max(0, scrollY.value) / STEP),
    (now, prev) => { if (now !== prev) runOnJS(setCurrent)(now); },
  );
  // 끝에서 세 칸 전부터 다음 페이지
  // 실패하면 다음 스크롤(current 변화)에서 다시 시도한다. 콜백이 바뀌는 것만으로는 부르지 않는다
  const onEndReached = useRef(props.onEndReached);
  onEndReached.current = props.onEndReached;
  useEffect(() => {
    if (n > 0 && current >= n - 3) onEndReached.current();
  }, [current, n]);

  const stageStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scrollY.value }] }));

  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  if (state === 'loading') {
    return (
      <View accessibilityLabel="러닝 기록을 불러오는 중" style={{ paddingTop: y0, paddingHorizontal: SIDE, gap: GAP }}>
        <View style={[styles.skeletonCard, { height: CARD_FULL }]}>
          <View style={[styles.skeleton, { width: 160, height: 14, margin: 25 }]} />
        </View>
        {[0.8, 0.6, 0.4].map((opacity) => (
          <View key={opacity} style={[styles.skeletonCard, { height: CARD_HEAD, opacity }]} />
        ))}
      </View>
    );
  }

  if (state === 'error' || n === 0) {
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

  const press = (k: number) => {
    const at = scrollY.value / STEP;
    if (Math.abs(at - k) < 0.1) {
      props.onRunPress(runs[k]._id, cardLayout(k, at, n, y0).top);
      return;
    }
    scrollRef.current?.scrollTo({ y: k * STEP, animated: true });
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size.height > 0 && (
        <Animated.ScrollView
          ref={scrollRef}
          accessibilityLabel="러닝 기록"
          onScroll={onScroll}
          scrollEventThrottle={16}
          snapToInterval={STEP}
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ height: (n - 1) * STEP + size.height }}
          refreshControl={
            <RefreshControl
              refreshing={props.refreshing}
              onRefresh={props.onRefresh}
              tintColor={c.value}
              colors={[c.value]}
              progressViewOffset={topInset}
            />
          }
        >
          <Animated.View style={[styles.stage, { height: size.height }, stageStyle]}>
            {runs.map((run, k) => (
              <MagazineCard
                key={run._id}
                run={run}
                index={k}
                count={n}
                scrollY={scrollY}
                y0={y0}
                width={cardWidth}
                // 지도 WebView는 펼쳐진 카드와 그 앞뒤에만
                liveMap={Math.abs(k - current) <= 1}
                filed={k === 0 && !!props.filedRunId && props.filedRunId === run._id}
                baseUrl={props.baseUrl}
                dimColor={c.dark ? '#05080B' : '#111113'}
                dimMax={c.dark ? 0.15 : 0.08}
                styles={styles}
                onPress={() => press(k)}
              />
            ))}
          </Animated.View>
        </Animated.ScrollView>
      )}
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(c.bg, 0), c.bg]}
        locations={[0, 0.78]}
        style={[styles.foot, { height: bottomInset + 40 }]}
      />
      {props.loadingMore && (
        <View accessibilityLabel="다음 기록 불러오는 중" style={[styles.more, { bottom: bottomInset }]} pointerEvents="none">
          <ActivityIndicator color={c.value} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  stage: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden' },
  card: {
    position: 'absolute', left: SIDE, right: SIDE, top: 0,
    borderRadius: CARD_RADIUS, overflow: 'hidden', backgroundColor: c.surface,
  },
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  more: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center' },
  skeletonCard: { borderRadius: CARD_RADIUS, backgroundColor: c.surface },
  skeleton: { height: 12, borderRadius: 6, backgroundColor: c.surface2 },
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
});
