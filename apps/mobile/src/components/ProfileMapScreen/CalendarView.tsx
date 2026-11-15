import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, PanResponder, Animated as RNAnimated, type LayoutChangeEvent,
} from 'react-native';
import Animated, { Easing, ZoomIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import client from '@/api/client';
import { CARD_HEAD, CARD_RADIUS, CollapsedRow, titleOf, type FeedRun } from '@/components/FeedCard';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';
import { useReducedMotion } from '@/utils/motion';
import { dayLevel, LEVEL_SIZE, monthGrid, monthRange } from './calendar';

interface Props {
  userId: string;
  topInset: number;
  bottomInset: number;
  /** 목록을 다시 불러오면 바뀌는 값 — 달 캐시를 비운다 */
  reloadKey: string;
  /** top = 누른 한 줄 카드의 화면 y(상세가 그 자리에서 열린다) */
  onRunPress: (runId: string, top: number) => void;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const PAGE = 50; // 서버 limit 최대
const SWIPE = 40; // 이만큼 넘게 밀면 달이 바뀐다
const GAP = 6;
const SIDE = 24;

type MonthKey = string; // 'YYYY-M'
type MonthState = { runs: FeedRun[] } | 'loading' | 'error';
const keyOf = (y: number, m: number): MonthKey => `${y}-${m}`;

// 고른 날: 원 지름의 9%(최소 2) 안쪽에 6%(최소 1.5) 두께 바탕색 링, 고를 때 0.22초 가장자리에서 조여 든다(⑤-1)
function SelectRing({ size, color, reduced }: { size: number; color: string; reduced: boolean }) {
  const inset = Math.max(2, size * 0.09);
  const width = Math.max(1.5, size * 0.06);
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [p, reduced]);
  const style = useAnimatedStyle(() => ({
    top: inset * p.value, left: inset * p.value, right: inset * p.value, bottom: inset * p.value,
    borderWidth: width * p.value,
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderRadius: size, borderColor: color }, style]} />;
}

// 캘린더 보기(R6 · R7, 2026-11-15 확정 시안 16차): 보고 있는 달 거리 + 월 격자, 달린 날은 거리 3단계 원.
// 좌우로 밀어 달을 넘기고(버튼 없음), 달린 날을 누르면 탭바 위에 한 줄 카드 → 상세
export function CalendarView({ userId, topInset, bottomInset, reloadKey, onRunPress }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduced = useReducedMotion();
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [cache, setCache] = useState<Record<MonthKey, MonthState>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [pickTops, setPickTops] = useState<Record<string, number>>({});
  const [picksY, setPicksY] = useState(0);

  const key = keyOf(month.y, month.m);
  const state = cache[key];

  // 다시 불러오면(새 기록 저장 등) 달 캐시를 비운다
  useEffect(() => { setCache({}); }, [reloadKey]);

  const fetchMonth = useCallback(async (y: number, m: number) => {
    const k = keyOf(y, m);
    setCache((prev) => ({ ...prev, [k]: 'loading' }));
    try {
      const { from, to } = monthRange(y, m);
      const all: FeedRun[] = [];
      for (let page = 1; ; page++) {
        const { data } = await client.get<FeedRun[]>(
          `/runs?userId=${userId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&page=${page}&limit=${PAGE}`,
        );
        all.push(...data);
        if (data.length < PAGE) break;
      }
      setCache((prev) => ({ ...prev, [k]: { runs: all } }));
    } catch {
      setCache((prev) => ({ ...prev, [k]: 'error' }));
    }
  }, [userId]);

  useEffect(() => {
    if (state === undefined) fetchMonth(month.y, month.m);
  }, [state, month, fetchMonth]);

  const runs = typeof state === 'object' ? state.runs : [];
  // 날짜별 기록(최근이 앞). 칸 단계는 그날 거리 합
  const byDay = useMemo(() => {
    const map: Record<number, FeedRun[]> = {};
    for (const run of runs) (map[new Date(run.createdAt).getDate()] ??= []).push(run);
    return map;
  }, [runs]);
  const totalKm = runs.reduce((sum, run) => sum + run.distanceKm, 0);
  const isNow = month.y === today.getFullYear() && month.m === today.getMonth();
  const grid = useMemo(() => monthGrid(month.y, month.m), [month]);
  const cell = width > 0 ? (width - GAP * 6) / 7 : 0;
  // 들어올 때 달린 날이 날짜 순서로 하나씩(40ms 간격) 찍힌다
  const order = useMemo(() => {
    const o: Record<number, number> = {};
    Object.keys(byDay).map(Number).sort((a, b) => a - b).forEach((day, i) => { o[day] = i; });
    return o;
  }, [byDay]);

  // 좌우 밀기 — 왼쪽으로 밀면 다음 달, 오른쪽이면 지난달. 이번 달 다음으로는 안 넘어가고 끌리다 돌아온다
  const dragX = useRef(new RNAnimated.Value(0)).current;
  const monthRef = useRef(month);
  monthRef.current = month;
  const canGo = (dir: number) => {
    const { y, m } = monthRef.current;
    return dir < 0 || y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth());
  };
  const go = (dir: number) => {
    const { y, m } = monthRef.current;
    const d = new Date(y, m + dir, 1);
    setSelected(null);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    if (reduced) { dragX.setValue(0); return; }
    dragX.setValue(dir * 64);
    RNAnimated.timing(dragX, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => dragX.setValue(canGo(g.dx < 0 ? 1 : -1) ? g.dx : g.dx * 0.25),
    onPanResponderRelease: (_, g) => {
      const dir = g.dx < 0 ? 1 : -1;
      if (Math.abs(g.dx) > SWIPE && canGo(dir)) { go(dir); return; }
      RNAnimated.spring(dragX, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => RNAnimated.spring(dragX, { toValue: 0, useNativeDriver: true }).start(),
  }), [dragX, reduced]);
  const slide = {
    transform: [{ translateX: dragX }],
    opacity: dragX.interpolate({ inputRange: [-500, 0, 500], outputRange: [0.5, 1, 0.5], extrapolate: 'clamp' }),
  };

  const picks = selected ? byDay[selected] ?? [] : [];
  const onPickLayout = (id: string) => (e: LayoutChangeEvent) => {
    const top = e.nativeEvent.layout.y;
    setPickTops((prev) => (prev[id] === top ? prev : { ...prev, [id]: top }));
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <RNAnimated.View
        {...pan.panHandlers}
        style={[styles.cal, { top: topInset + 24 }, slide]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {/* 스크린리더는 큰 숫자에서 위아래로 쓸어 달을 넘긴다(밀기 대신) */}
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${month.y}년 ${month.m + 1}월, ${totalKm.toFixed(1)} km, ${runs.length}회`}
          accessibilityActions={[{ name: 'increment', label: '다음 달' }, { name: 'decrement', label: '지난달' }]}
          onAccessibilityAction={(e) => {
            const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1;
            if (canGo(dir)) go(dir);
          }}
          style={styles.hero}
        >
          <Text style={styles.heroNum}>{state === 'loading' || state === undefined ? '–' : totalKm.toFixed(1)}</Text>
          <Text style={styles.heroUnit}>km</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{`${MONTHS[month.m]} ${month.y}`}</Text>
          {state === 'error' ? (
            <Pressable accessibilityRole="button" onPress={() => fetchMonth(month.y, month.m)} hitSlop={12}>
              <Text style={[styles.metaText, styles.retry]}>다시 시도</Text>
            </Pressable>
          ) : (
            <Text style={styles.metaText}>{`${runs.length} RUNS`}</Text>
          )}
        </View>
        <View style={styles.grid}>
          {WEEK.map((d, i) => (
            <Text key={i} style={[styles.week, { width: cell }, isNow && i === (today.getDay() + 6) % 7 && styles.weekNow]}>{d}</Text>
          ))}
          {cell > 0 && grid.map((day, i) => {
            if (day === null) return <View key={`x${i}`} style={{ width: cell, height: cell }} />;
            const list = byDay[day];
            const isToday = isNow && day === today.getDate();
            if (!list) {
              return (
                <View key={day} style={[styles.day, { width: cell, height: cell, borderRadius: cell / 2 }]}>
                  {isToday && <View style={styles.todayDot} />}
                </View>
              );
            }
            const km = list.reduce((sum, run) => sum + run.distanceKm, 0);
            const level = dayLevel(km);
            const size = cell * LEVEL_SIZE[level];
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === day }}
                accessibilityLabel={`${month.m + 1}월 ${day}일 ${km.toFixed(1)} km, ${level + 1}단계`}
                onPress={() => setSelected(day)}
                style={[styles.day, { width: cell, height: cell, borderRadius: cell / 2 }]}
              >
                <Animated.View
                  key={`${key}-${day}`}
                  entering={reduced ? undefined : ZoomIn.delay(order[day] * 40).duration(260)}
                  style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.level[level] }}
                >
                  {selected === day && <SelectRing size={size} color={c.bg} reduced={reduced} />}
                </Animated.View>
                {isToday && <View style={styles.todayDot} />}
              </Pressable>
            );
          })}
        </View>
      </RNAnimated.View>

      {picks.length > 0 && (
        <View style={[styles.picks, { bottom: bottomInset }]} onLayout={(e) => setPicksY(e.nativeEvent.layout.y)}>
          {picks.map((run) => (
            <Pressable
              key={run._id}
              accessibilityRole="button"
              accessibilityLabel={`${titleOf(run)} 상세 열기`}
              onLayout={onPickLayout(run._id)}
              onPress={() => onRunPress(run._id, picksY + (pickTops[run._id] ?? 0))}
              style={styles.pick}
            >
              <CollapsedRow run={run} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  cal: { position: 'absolute', left: SIDE, right: SIDE },
  hero: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroNum: { fontFamily: FONT.num, fontSize: 120, lineHeight: 112, letterSpacing: -4, color: c.text, fontVariant: ['tabular-nums'] },
  heroUnit: { fontFamily: FONT.num, fontSize: 20, color: c.text2 },
  meta: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { ...monoLabel(11, 0.13), color: c.text2 },
  retry: { color: c.text, textDecorationLine: 'underline' },
  grid: { marginTop: 30, flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: GAP },
  week: { ...monoLabel(10, 0.1), paddingBottom: 4, textAlign: 'center', color: c.muted },
  weekNow: { fontFamily: FONT.monoMedium, color: c.text },
  day: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2 },
  todayDot: { position: 'absolute', bottom: -6, width: 4, height: 4, borderRadius: 2, backgroundColor: c.text },
  // 같은 날 기록이 여러 개면 위로 쌓는다(최근이 아래)
  picks: { position: 'absolute', left: 10, right: 10, flexDirection: 'column-reverse', gap: GAP },
  pick: { height: CARD_HEAD, borderRadius: CARD_RADIUS, overflow: 'hidden', backgroundColor: c.surface },
});
