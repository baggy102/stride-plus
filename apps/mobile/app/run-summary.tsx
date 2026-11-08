import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  View, Text, Pressable, TextInput, Modal,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Dimensions,
  type LayoutChangeEvent, type LayoutRectangle,
} from 'react-native';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRunStore } from '@/store/run';
import client from '@/api/client';
import { RouteMap } from '@/components/RouteMap';
import { CoordLine } from '@/components/Telemetry';
import { PhotoPicker } from '@/components/RunSummary/PhotoPicker';
import { generateRouteImage } from '@/components/RunSummary/generateRouteImage';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import { withAlpha, type Palette } from '@/theme/colors';
import { formatDuration, formatPace, formatRunPace } from '@/utils/pace';
import { formatClock, formatDay } from '@/utils/date';
import { kmSplits } from '@/utils/route';
import { MOTION, useReducedMotion } from '@/utils/motion';
import { DustTransition } from '@/components/DustTransition';
import { DUST_MS, DUST_SCALE, buildDust, inOut, seg, sine, type BarRect, type Dust } from '@/utils/dust';

// 가루 전환 타임라인(시안 5400 단위, 실제로는 DUST_MS로 압축). [시작, 끝]
const TL = {
  head: [1200, 2100], coords: [1370, 2270], blueprint: [2300, 3100], line: [2600, 4200],
  sheet: [1000, 1900], distance: [1540, 2440], cells: [1710, 2610],
  bars: [4100, 5000], labels: [4300, 5200], form: [4450, 5350],
} as const;
const BAR_GAP = 6;
const BARS_H = 44;
// 막대가 다 굳는 순간 한 번 진동(마지막 막대 기준)
const HAPTIC_AT = (TL.bars[1] + 200) / DUST_SCALE;

// 요소 하나의 스르륵(투명도 + 아래에서 lift px 떠오름). 동작 줄이기면 150ms 크로스페이드
function useReveal(clock: SharedValue<number>, reduced: boolean, [a, b]: readonly [number, number], lift = 8) {
  return useAnimatedStyle(() => {
    const k = reduced ? seg(clock.value, 0, MOTION.reduced) : sine(seg(clock.value * DUST_SCALE, a, b));
    return { opacity: k, transform: [{ translateY: reduced ? 0 : lift * (1 - k) }] };
  });
}

// km별 막대 높이: 빠를수록 높다(18~44px). 다 채운 km만
function splitHeights(splits: number[]): number[] {
  const min = Math.min(...splits);
  const max = Math.max(...splits);
  return splits.map((s) => (max === min ? 32 : Math.round(18 + (26 * (max - s)) / (max - min))));
}

// 시작점의 동네 이름(「여의도 한강공원」처럼). 못 찾으면 null
async function placeName([lng, lat]: [number, number]): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return place?.name || place?.district || place?.street || place?.city || null;
  } catch {
    return null;
  }
}

// Frost S07 러닝 요약 — 격자 도면(+1 km 눈금) · 좌표 · 거리 76px · TIME/PACE · km 스플릿 · 사진 · 코스 소개 · 저장, 삭제 확인
export default function RunSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(() => Dimensions.get('window').width);
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const pendingSummary = useRunStore((s) => s.pendingSummary);
  const resetRun = useRunStore((s) => s.resetRun);
  const clearPendingSummary = useRunStore((s) => s.clearPendingSummary);

  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [finishedAt] = useState(() => new Date());
  const [place, setPlace] = useState<string | null>(null);

  // 요약 데이터 없이 직접 진입한 경우(새로고침 등) 기록 탭으로 되돌림. 저장·삭제로 떠나는 중에는 하지 않는다
  const leaving = useRef(false);
  useEffect(() => {
    if (!pendingSummary && !leaving.current) router.replace('/(tabs)/record');
  }, [pendingSummary, router]);

  const start = pendingSummary?.coordinates[0];
  useEffect(() => {
    if (start) placeName(start).then(setPlace);
  }, [start?.[0], start?.[1]]);

  const splits = useMemo(
    () => (pendingSummary ? kmSplits(pendingSummary.coordinates, pendingSummary.routeTimes, pendingSummary.segmentBreaks) : []),
    [pendingSummary],
  );

  // 가루 전환(약 3초): 점 구름이 흩어지는 동안 결과 시트가 화면 아래에서 올라오고,
  // 가루는 구간별 페이스 막대로 흘러내려 쌓인다. 모든 요소가 같은 시계(clock, 실제 ms)를 본다
  const reduced = useReducedMotion();
  const settleFrom = useRunStore((s) => s.settleFrom);
  const clock = useSharedValue(0);
  const [rootH, setRootH] = useState(() => Dimensions.get('window').height);
  const [dust, setDust] = useState<Dust | null>(null);
  const [head, setHead] = useState<[number, number] | null>(null);
  const started = useRef(false);
  const [dustDone, setDustDone] = useState(false);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const layouts = useRef<Record<string, LayoutRectangle>>({});
  const total = reduced ? MOTION.reduced : DUST_MS;

  const beginClock = () => {
    if (started.current) return;
    started.current = true;
    clock.value = withTiming(total, { duration: total, easing: Easing.linear });
  };

  // 막대 상자(오버레이 좌표) = 스크롤 → 시트 → 결과 → 막대 줄의 onLayout을 더한 값(시트의 이동은 빼고 최종 자리)
  const building = useRef(false);
  const tryBuild = () => {
    if (started.current || building.current) return;
    const L = layouts.current;
    const parts = ['scroll', 'sheet', 'result', 'splits', 'bars'];
    const needBars = splits.length > 0;
    if (!L.root || (needBars && parts.some((k) => !L[k]))) return;
    if (reduced || !settleFrom) { beginClock(); return; }
    let bars: BarRect[] = [];
    if (needBars) {
      const x = parts.reduce((v, k) => v + L[k].x, 0);
      const y = parts.reduce((v, k) => v + L[k].y, 0);
      const w = (L.bars.width - BAR_GAP * (splits.length - 1)) / splits.length;
      bars = splitHeights(splits).map((h, i) => ({ x: x + i * (w + BAR_GAP), y: y + BARS_H - h, w, h }));
      // 작은 화면에서 막대가 처음부터 화면 밖이면 가루는 흩어졌다 사라지기만 한다
      if (y + BARS_H > L.root.height) bars = [];
    }
    const rootView = rootRef.current;
    if (!rootView) { beginClock(); return; }
    building.current = true;
    rootView.measureInWindow((rx, ry) => {
      const dots = settleFrom.dots.map(([dx, dy]): [number, number] => [dx - rx, dy - ry]);
      setDust(buildDust(dots, bars));
      setHead(dots.length ? dots[dots.length - 1] : null);
      beginClock();
    });
  };
  const onLayoutOf = (key: string) => (e: LayoutChangeEvent) => {
    layouts.current[key] = e.nativeEvent.layout;
    tryBuild();
  };

  // 끝나면 가루 레이어를 내린다. 막대가 굳는 순간 가벼운 진동 한 번
  const hasBars = splits.length > 0 && !!dust;
  const buzz = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  useAnimatedReaction(
    () => clock.value,
    (now, prev) => {
      if (prev === null) return;
      if (hasBars && !reduced && now >= HAPTIC_AT && prev < HAPTIC_AT) runOnJS(buzz)();
      if (now >= total && prev < total) runOnJS(setDustDone)(true);
    },
    [hasBars, reduced, total],
  );
  // 화면을 만지면 바로 끝 상태로(전환이 입력을 막지 않는다)
  const skip = () => {
    if (clock.value >= total) return;
    cancelAnimation(clock);
    clock.value = total;
  };

  const headStyle = useReveal(clock, reduced, TL.head);
  const coordsStyle = useReveal(clock, reduced, TL.coords, 0);
  const blueprintStyle = useReveal(clock, reduced, TL.blueprint, 0);
  const distanceStyle = useReveal(clock, reduced, TL.distance);
  const cellsStyle = useReveal(clock, reduced, TL.cells);
  const labelsStyle = useReveal(clock, reduced, TL.labels, 0);
  const formStyle = useReveal(clock, reduced, TL.form);
  // 결과 시트: 화면 아래 밖에서 올라온다(저장 버튼 줄도 함께)
  const sheetStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: seg(clock.value, 0, MOTION.reduced), transform: [{ translateY: 0 }] };
    return { opacity: 1, transform: [{ translateY: rootH * (1 - inOut(seg(clock.value * DUST_SCALE, TL.sheet[0], TL.sheet[1]))) }] };
  });

  if (!pendingSummary) return null;
  const summary = pendingSummary;
  const boxWidth = width - 48;

  const handleDiscard = () => {
    setConfirmDelete(false);
    leaving.current = true;
    resetRun();
    router.replace('/(tabs)/record');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const form = new FormData();
      form.append('coordinates', JSON.stringify(summary.coordinates));
      form.append('routeTimes', JSON.stringify(summary.routeTimes));
      form.append('distanceKm', String(summary.distanceKm));
      form.append('paceSecPerKm', String(summary.paceSecPerKm));
      form.append('description', description);

      const routeFile = await generateRouteImage(summary.coordinates);
      if (routeFile) {
        form.append('routeImage', routeFile as unknown as Blob);
      }

      photos.forEach((uri, i) => {
        const ext = uri.split('.').pop() ?? 'jpg';
        const name = `photo_${i}.${ext}`;
        form.append('photos', { uri, name, type: `image/${ext}` } as unknown as Blob);
      });

      const { data: run } = await client.post<{ _id: string }>('/runs', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await client.post('/posts', { runId: run._id });

      leaving.current = true;
      clearPendingSummary();
      resetRun();
      // File(520ms): 요약이 앨범(내 기록 목록)의 맨 위 히어로로 접혀 들어간다
      router.replace({ pathname: '/(tabs)/profile', params: { filed: run._id } });
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={styles.root}
      onTouchStart={skip}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        setRootH(e.nativeEvent.layout.height);
        onLayoutOf('root')(e);
      }}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          onLayout={onLayoutOf('scroll')}
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 10 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 머리: 「러닝 종료 · 10.16 목 · 07:05」 + 장소 */}
          <Animated.View style={[styles.head, headStyle]}>
            <Text style={styles.kicker}>{`러닝 종료 · ${formatDay(finishedAt)} · ${formatClock(finishedAt)}`}</Text>
            <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>{place ?? '이번 러닝'}</Text>
          </Animated.View>

          {/* 경로 도면: 가루가 빠져나간 자리에 그려진다 */}
          <Animated.View style={[styles.blueprint, blueprintStyle]}>
            <RouteMap coordinates={summary.coordinates} fit="route" kmTicks style={{ width: boxWidth, height: 192, borderRadius: 12, overflow: 'hidden' }} />
          </Animated.View>
          <Animated.View style={[styles.coords, coordsStyle]}>
            <CoordLine at={start} />
          </Animated.View>

          {/* 결과 시트: 러닝 결과 + 사진·코스 소개 */}
          <Animated.View onLayout={onLayoutOf('sheet')} style={[styles.sheet, sheetStyle]}>
          <View style={styles.grabber} />
          <View onLayout={onLayoutOf('result')} accessibilityLabel="러닝 결과" style={styles.result}>
            <Animated.View accessible accessibilityLabel={`거리 ${summary.distanceKm.toFixed(2)} km`} style={[styles.distanceRow, distanceStyle]}>
              <Text style={styles.distance}>{summary.distanceKm.toFixed(2)}</Text>
              <Text style={styles.distanceUnit}>KM</Text>
            </Animated.View>
            <Animated.View style={[styles.grid, cellsStyle]}>
              <View style={styles.cell}>
                <Text style={styles.cellLabel}>TIME</Text>
                <Text style={styles.cellValue}>{formatDuration(summary.elapsedSeconds)}</Text>
              </View>
              <View style={[styles.cell, styles.cellDivider]}>
                <Text style={styles.cellLabel}>PACE</Text>
                <Text style={styles.cellValue}>
                  {formatRunPace(summary.paceSecPerKm, summary.distanceKm)}
                  <Text style={styles.cellUnit}> /KM</Text>
                </Text>
              </View>
            </Animated.View>
            {splits.length > 0 && (
              <SplitBars
                splits={splits}
                c={c}
                styles={styles}
                clock={clock}
                reduced={reduced}
                labelsStyle={labelsStyle}
                onLayout={onLayoutOf('splits')}
                onBarsLayout={onLayoutOf('bars')}
              />
            )}
          </View>

          <Animated.View style={[styles.form, formStyle]}>
            <PhotoPicker photos={photos} onChange={setPhotos} />

            <View style={{ gap: 4 }}>
              <Text style={styles.label}>
                코스 소개 <Text style={{ fontFamily: FONT.regular }}>(선택)</Text>
              </Text>
              <TextInput
                accessibilityLabel="코스 소개"
                value={description}
                onChangeText={setDescription}
                placeholder="풍경, 경사, 추천 시간대 등"
                placeholderTextColor={c.muted}
                style={styles.input}
              />
              <Text style={styles.help}>다른 러너가 코스를 고를 때 보여요</Text>
            </View>
          </Animated.View>
          </Animated.View>
        </ScrollView>

        <Animated.View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }, sheetStyle]}>
          <Pressable
            accessibilityRole="button"
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, { opacity: saving ? 0.8 : 1 }]}
          >
            {saving ? <ActivityIndicator color={c.ink} /> : <Text style={styles.saveText}>저장하기</Text>}
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>

      {dust && !dustDone && !reduced && (
        <DustTransition dust={dust} clock={clock} head={head} width={width} height={rootH} c={c} />
      )}

      <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={[styles.deleteBtn, { top: insets.top - 2 }]}>
        <Text style={styles.deleteText}>삭제</Text>
      </Pressable>

      {/* 삭제 확인 */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={[styles.scrim, { backgroundColor: c.scrim }]}>
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text style={styles.dialogTitle}>이 기록을 저장하지 않고 삭제할까요?</Text>
            <Text style={styles.dialogBody}>삭제한 기록은 되돌릴 수 없어요.</Text>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={styles.dialogKeep}>
                <Text style={styles.dialogKeepText}>계속 편집</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={handleDiscard} style={styles.dialogDelete}>
                <Text style={styles.dialogDeleteText}>삭제</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface SplitBarsProps {
  splits: number[];
  c: Palette;
  styles: ReturnType<typeof makeStyles>;
  clock: SharedValue<number>;
  reduced: boolean;
  labelsStyle: ReturnType<typeof useAnimatedStyle>;
  onLayout: (e: LayoutChangeEvent) => void;
  onBarsLayout: (e: LayoutChangeEvent) => void;
}

// km별 페이스 막대: 빠를수록 높다(18~44px). 쌓인 가루가 왼쪽 막대부터 실제 막대로 굳는다
function SplitBars({ splits, c, styles, clock, reduced, labelsStyle, onLayout, onBarsLayout }: SplitBarsProps) {
  const heights = splitHeights(splits);
  const label = `km별 페이스: ${splits.map((s, i) => `${i + 1}km ${formatPace(s)}`).join(', ')}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.splits} onLayout={onLayout}>
      <View style={styles.splitBars} onLayout={onBarsLayout}>
        {heights.map((h, i) => (
          <SplitBar key={i} index={i} height={h} c={c} styles={styles} clock={clock} reduced={reduced} />
        ))}
      </View>
      <Animated.View style={[styles.splitLabels, labelsStyle]}>
        {splits.map((_, i) => (
          <Text key={i} style={styles.splitLabel}>{i + 1}</Text>
        ))}
      </Animated.View>
    </View>
  );
}

function SplitBar({ index, height, c, styles, clock, reduced }: {
  index: number; height: number; c: Palette; styles: ReturnType<typeof makeStyles>; clock: SharedValue<number>; reduced: boolean;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: reduced
      ? seg(clock.value, 0, MOTION.reduced)
      : sine(seg(clock.value * DUST_SCALE, TL.bars[0] + index * 90, TL.bars[1] + index * 90)),
  }));
  return (
    <Animated.View style={[styles.splitBar, { height }, style]}>
      <LinearGradient colors={[c.value, withAlpha(c.value, c.dark ? 0.25 : 0.18)]} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  head: { paddingHorizontal: 24, paddingRight: 86 },
  kicker: { ...monoLabel(12, 0.08), lineHeight: 18, color: c.text2 },
  title: { marginTop: 4, fontFamily: FONT.bold, fontSize: 20, lineHeight: 26, color: c.text },
  blueprint: { marginTop: 14, paddingHorizontal: 24 },
  coords: { marginTop: 4 },
  deleteBtn: { position: 'absolute', right: 8, height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  deleteText: { fontFamily: FONT.semibold, fontSize: 15, color: c.text2 },
  // 결과 시트: 화면 아래에서 올라오는 면. 저장 버튼 줄(footer)과 같은 색으로 이어진다
  sheet: {
    flexGrow: 1, marginTop: 12, paddingTop: 10, paddingBottom: 24, backgroundColor: c.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderTopColor: c.hair,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 10 },
  result: { paddingHorizontal: 24 },
  distanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  distance: { fontFamily: FONT.num, fontSize: 76, lineHeight: 80, letterSpacing: -1.5, color: c.text, fontVariant: ['tabular-nums'] },
  // 팔레트 토큰 이름이 value라 인라인 { color: c.value }는 reanimated 플러그인이 shared value로 오인해 경고한다 → StyleSheet로
  distanceUnit: { marginTop: 12, ...monoLabel(14), color: c.value },
  grid: { marginTop: 8, flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hair },
  cell: { flex: 1, paddingVertical: 8 },
  cellDivider: { paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: c.hair },
  cellLabel: { ...monoLabel(11), lineHeight: 16, color: c.text2 },
  cellValue: { fontFamily: FONT.num, fontSize: 24, lineHeight: 30, color: c.text, fontVariant: ['tabular-nums'] },
  cellUnit: { ...monoLabel(11, 0.08), color: c.text2 },
  splits: { marginTop: 12 },
  splitBars: { height: BARS_H, flexDirection: 'row', alignItems: 'flex-end', gap: BAR_GAP },
  splitBar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2, overflow: 'hidden' },
  splitLabels: { marginTop: 3, flexDirection: 'row', gap: 6 },
  splitLabel: { flex: 1, textAlign: 'center', ...monoLabel(10, 0), lineHeight: 12, color: c.text2 },
  label: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  form: { marginTop: 20, paddingHorizontal: 24, gap: 20 },
  input: {
    height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.input, color: c.text, fontFamily: FONT.regular, fontSize: 15,
  },
  help: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  footer: { paddingHorizontal: 24, paddingTop: 8, backgroundColor: c.surface },
  saveBtn: { height: 54, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 35 },
  dialog: {
    alignSelf: 'stretch', paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20, borderRadius: 20, backgroundColor: c.surface, gap: 8,
    borderTopWidth: 1, borderTopColor: c.hair,
  },
  dialogTitle: { fontFamily: FONT.semibold, fontSize: 18, lineHeight: 26, color: c.text },
  dialogBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2 },
  dialogActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  dialogKeep: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  dialogKeepText: { fontFamily: FONT.semibold, fontSize: 15, color: c.text },
  dialogDelete: { flex: 1, height: 48, borderRadius: 12, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' },
  dialogDeleteText: { fontFamily: FONT.semibold, fontSize: 15, color: '#FFFFFF' },
});
