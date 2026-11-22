import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  View, Text, Pressable, TextInput, Modal,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Dimensions,
  type LayoutChangeEvent, type LayoutRectangle, type TextInputProps,
} from 'react-native';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRunStore } from '@/store/run';
import client from '@/api/client';
import { RouteMap } from '@/components/RouteMap';
import { Wordmark } from '@/components/Wordmark';
import { PhotoPicker } from '@/components/RunSummary/PhotoPicker';
import { ShareIcon, TrashIcon } from '@/components/icons';
import { useRunShare } from '@/components/useRunShare';
import { useAuthStore } from '@/store/auth';
import { generateRouteImage } from '@/components/RunSummary/generateRouteImage';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import { withAlpha, type Palette } from '@/theme/colors';
import { formatDuration, formatPace, formatRunPace } from '@/utils/pace';
import { formatClock, formatDay } from '@/utils/date';
import { kmSplits, kmTail } from '@/utils/route';
import { MOTION, useReducedMotion } from '@/utils/motion';
import { DustTransition } from '@/components/DustTransition';
import { DUST_SCALE, buildDust, dustTotal, freezeAt, inOut, out3, seg, sine, type BarRect, type Dust } from '@/utils/dust';

// 가루 전환 타임라인(시안 5400 단위, DUST_SCALE로 실제 ms와 바꾼다). [시작, 끝]
// 막대 · 라벨 · 거리 숫자는 막대가 얼어붙는 시각(freezeAt, 실제 ms)을 따른다. 입력란(form)은 전환이 가장 짧을 때도 그 안에 다 보인다
const TL = {
  head: [1200, 2100], coords: [1370, 2270], blueprint: [2300, 3100], line: [2600, 4200],
  sheet: [1000, 1900], distance: [1540, 2440], cells: [1710, 2610],
  form: [3700, 4600],
} as const;
const BAR_GAP = 6;
const BARS_H = 44;
// 거리 숫자는 가루가 내려앉기 시작할 때부터 센다(ms)
const COUNT_FROM = 700;
// 얼어붙을 때 막대를 훑는 빛의 폭(px)
const SHINE_W = 24;
const SHINE = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'] as const;

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// km 하나 = 막대 하나(sec = 걸린 시간). 마지막 자투리는 km < 1
interface Split { sec: number; km: number }

// 요소 하나의 스르륵(투명도 + 아래에서 lift px 떠오름). 동작 줄이기면 150ms 크로스페이드
function useReveal(clock: SharedValue<number>, reduced: boolean, [a, b]: readonly [number, number], lift = 8) {
  return useAnimatedStyle(() => {
    const k = reduced ? seg(clock.value, 0, MOTION.reduced) : sine(seg(clock.value * DUST_SCALE, a, b));
    return { opacity: k, transform: [{ translateY: reduced ? 0 : lift * (1 - k) }] };
  });
}

// 막대 높이(고정 척도): 5'30"/km가 30px, 40초 빠를 때마다 14px 높다. 16~44px
function barHeight(paceSec: number): number {
  return Math.min(BARS_H, Math.max(16, Math.round(30 + ((330 - paceSec) / 40) * 14)));
}
// 막대 칸 폭: 5칸 기준으로 왼쪽부터 채운다. 5개를 넘으면 그때 좁힌다
function barSlot(barsWidth: number, count: number): number {
  return Math.min((barsWidth - BAR_GAP * 4) / 5, (barsWidth - BAR_GAP * (count - 1)) / count);
}
// 자투리 막대는 거리 비율만큼(최소 10px)
function barWidth(slot: number, km: number): number {
  return km < 1 ? Math.max(10, slot * km) : slot;
}
// 자투리 라벨: 0.84 km → 「.84」
function tailLabel(km: number): string {
  return `.${String(Math.min(99, Math.round(km * 100))).padStart(2, '0')}`;
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
  // 기록 화면에서 뺀 「RUN/0427」(내 몇 번째 러닝인지)을 머리줄에 붙인다. 모르면 생략
  const runNo = useRunStore((s) => s.runNo);

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

  const splits = useMemo((): Split[] => {
    if (!pendingSummary) return [];
    const { coordinates, routeTimes, segmentBreaks } = pendingSummary;
    const whole = kmSplits(coordinates, routeTimes, segmentBreaks).map((sec) => ({ sec, km: 1 }));
    const tail = kmTail(coordinates, routeTimes, segmentBreaks);
    return tail ? [...whole, tail] : whole;
  }, [pendingSummary]);

  // 가루 전환(약 2.7~3.3초): 점 구름이 경로를 따라 금이 가며 깨지는 동안 결과 시트가 화면 아래에서 올라오고,
  // 조각은 자기 km 막대로 내려앉아 얼어붙는다. 모든 요소가 같은 시계(clock, 실제 ms)를 본다
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
  const barCount = splits.length;
  const lastFreeze = freezeAt(Math.max(0, barCount - 1), Math.max(1, barCount));
  const total = reduced ? MOTION.reduced : dustTotal(barCount);

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
      const slot = barSlot(L.bars.width, splits.length);
      bars = splits.map((s, i) => {
        const h = barHeight(s.sec / s.km);
        return { x: x + i * (slot + BAR_GAP), y: y + BARS_H - h, w: barWidth(slot, s.km), h };
      });
      // 작은 화면에서 막대가 처음부터 화면 밖이면 가루는 흩어졌다 사라지기만 한다
      if (y + BARS_H > L.root.height) bars = [];
    }
    const rootView = rootRef.current;
    if (!rootView) { beginClock(); return; }
    building.current = true;
    rootView.measureInWindow((rx, ry) => {
      const dots = settleFrom.dots.map(([dx, dy]): [number, number] => [dx - rx, dy - ry]);
      setDust(buildDust(dots, bars, splits.reduce((v, s) => v + s.km, 0)));
      setHead(dots.length ? dots[dots.length - 1] : null);
      beginClock();
    });
  };
  const onLayoutOf = (key: string) => (e: LayoutChangeEvent) => {
    layouts.current[key] = e.nativeEvent.layout;
    tryBuild();
  };

  // 끝나면 가루 레이어를 내린다. 마지막 막대가 얼어붙는 순간 가벼운 진동 한 번
  const hasBars = splits.length > 0 && !!dust;
  const buzz = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  useAnimatedReaction(
    () => clock.value,
    (now, prev) => {
      if (prev === null) return;
      if (hasBars && !reduced && now >= lastFreeze && prev < lastFreeze) runOnJS(buzz)();
      if (now >= total && prev < total) runOnJS(setDustDone)(true);
    },
    [hasBars, reduced, total, lastFreeze],
  );
  // 화면을 만지면 바로 끝 상태로(전환이 입력을 막지 않는다)
  const skip = () => {
    if (clock.value >= total) return;
    cancelAnimation(clock);
    clock.value = total;
  };

  const headStyle = useReveal(clock, reduced, TL.head);
  const blueprintStyle = useReveal(clock, reduced, TL.blueprint, 0);
  const distanceStyle = useReveal(clock, reduced, TL.distance);
  const cellsStyle = useReveal(clock, reduced, TL.cells);
  const labelsStyle = useReveal(clock, reduced, [(freezeAt(0, Math.max(1, barCount)) - 100) * DUST_SCALE, (lastFreeze + 150) * DUST_SCALE], 0);
  const formStyle = useReveal(clock, reduced, TL.form);
  // 거리 숫자: 가루가 내려앉기 시작할 때부터 마지막 막대가 얼 때까지 0 → 거리(감속). 화면 전체를 다시 그리지 않도록 UI 스레드에서 글자만 바꾼다
  const finalKm = pendingSummary?.distanceKm ?? 0;
  const countProps = useAnimatedProps(() => {
    const k = reduced ? 1 : out3(seg(clock.value, COUNT_FROM, lastFreeze + 150));
    return { text: (finalKm * k).toFixed(2) } as unknown as TextInputProps;
  });
  // 결과 시트: 화면 아래 밖에서 올라온다(저장 버튼 줄도 함께)
  const sheetStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: seg(clock.value, 0, MOTION.reduced), transform: [{ translateY: 0 }] };
    return { opacity: 1, transform: [{ translateY: rootH * (1 - inOut(seg(clock.value * DUST_SCALE, TL.sheet[0], TL.sheet[1]))) }] };
  });

  // 결과를 보면서 바로 공유(2026-11-21 — 저장 후 내 흔적에서 옮김). 저장하지 않고 공유만 해도 된다
  const { sharing, share, node: shareNode } = useRunShare();
  const myId = useAuthStore((s) => s.user?._id);

  if (!pendingSummary) return null;
  const summary = pendingSummary;

  const handleShare = async () => {
    // 「처음 달린 길」: 내 러닝 첫 페이지(최근 20개)와 비교. 못 불러오면 비교할 기록 없이 계산한다(그때는 전부 처음 달린 길로 나온다)
    let previous: [number, number][][] = [];
    try {
      if (myId) {
        const { data } = await client.get<{ route?: [number, number][] }[]>(`/runs?userId=${myId}&page=1&limit=20`);
        previous = data.map((r) => r.route ?? []).filter((r) => r.length > 0);
      }
    } catch {
      // 비교할 기록 없이 진행
    }
    await share({
      route: summary.coordinates, previous,
      distanceKm: summary.distanceKm, paceSecPerKm: summary.paceSecPerKm, createdAt: finishedAt.toISOString(),
    });
  };
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
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 50 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 머리: 「RUN/0427 · 10.16 목 · 07:05」 + 장소 */}
          <Animated.View style={[styles.head, headStyle]}>
            <Text style={styles.kicker}>{`${runNo !== null ? `RUN/${String(runNo).padStart(4, '0')} · ` : ''}${formatDay(finishedAt)} · ${formatClock(finishedAt)}`}</Text>
            <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>{place ?? '이번 러닝'}</Text>
          </Animated.View>

          {/* 경로 도면: 가루가 빠져나간 자리에 그려진다 */}
          <Animated.View style={[styles.blueprint, blueprintStyle]}>
            <RouteMap coordinates={summary.coordinates} fit="route" highlighter cloud style={{ width: boxWidth, height: 236, borderRadius: 16, overflow: 'hidden' }} />
          </Animated.View>

          {/* 결과 시트: 러닝 결과 + 사진·코스 소개 */}
          <Animated.View onLayout={onLayoutOf('sheet')} style={[styles.sheet, sheetStyle]}>
          <View style={styles.grabber} />
          <View onLayout={onLayoutOf('result')} accessibilityLabel="러닝 결과" style={styles.result}>
            <Animated.View accessible accessibilityLabel={`거리 ${summary.distanceKm.toFixed(2)} km`} style={[styles.distanceRow, distanceStyle]}>
              {/* 처음 값을 최종 거리로 둬야 글자 폭이 최종 값에 맞는다 */}
              <AnimatedTextInput
                editable={false}
                underlineColorAndroid="transparent"
                defaultValue={summary.distanceKm.toFixed(2)}
                animatedProps={countProps}
                style={[styles.distance, styles.distanceInput]}
              />
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
                barsWidth={boxWidth}
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

            <TextInput
              accessibilityLabel="코스 소개"
              value={description}
              onChangeText={setDescription}
              placeholder="코스 소개 (선택)"
              placeholderTextColor={c.muted}
              style={styles.input}
            />
          </Animated.View>
          </Animated.View>
        </ScrollView>

        <Animated.View style={[styles.footer, styles.footerRow, { paddingBottom: Math.max(insets.bottom, 16) }, sheetStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이번 러닝 공유"
            accessibilityState={{ busy: sharing, disabled: saving }}
            onPress={handleShare}
            disabled={sharing || saving}
            style={[styles.shareBtn, { opacity: saving ? 0.5 : 1 }]}
          >
            {sharing ? <ActivityIndicator color={c.text} /> : <ShareIcon size={18} color={c.text} />}
            <Text style={styles.shareText}>공유</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleSave}
            disabled={saving || sharing}
            style={[styles.saveBtn, styles.saveFlex, { opacity: saving ? 0.8 : 1 }]}
          >
            {saving ? <ActivityIndicator color={c.ink} /> : <Text style={styles.saveText}>저장하기</Text>}
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>

      {shareNode}

      {dust && !dustDone && !reduced && (
        <DustTransition dust={dust} clock={clock} head={head} width={width} height={rootH} c={c} />
      )}

      <View pointerEvents="none" style={[styles.logo, { top: insets.top + 10 }]}>
        <Wordmark width={71} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="기록 삭제" onPress={() => setConfirmDelete(true)} style={[styles.deleteBtn, { top: insets.top - 2 }]}>
        <TrashIcon color={c.danger} />
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
  splits: Split[];
  barsWidth: number;
  c: Palette;
  styles: ReturnType<typeof makeStyles>;
  clock: SharedValue<number>;
  reduced: boolean;
  labelsStyle: ReturnType<typeof useAnimatedStyle>;
  onLayout: (e: LayoutChangeEvent) => void;
  onBarsLayout: (e: LayoutChangeEvent) => void;
}

// km별 페이스 막대(고정 폭 · 고정 높이 척도, 마지막은 자투리). 내려앉은 가루가 1 km 막대부터 차례로 얼어붙는다
function SplitBars({ splits, barsWidth, c, styles, clock, reduced, labelsStyle, onLayout, onBarsLayout }: SplitBarsProps) {
  const slot = barSlot(barsWidth, splits.length);
  const label = `km별 페이스: ${splits.map((s, i) => `${s.km < 1 ? `마지막 ${s.km.toFixed(2)}` : i + 1}km ${formatPace(s.sec / s.km)}`).join(', ')}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.splits} onLayout={onLayout}>
      <View style={styles.splitBars} onLayout={onBarsLayout}>
        {splits.map((s, i) => (
          <SplitBar
            key={i}
            index={i}
            count={splits.length}
            width={barWidth(slot, s.km)}
            height={barHeight(s.sec / s.km)}
            tail={s.km < 1}
            c={c}
            styles={styles}
            clock={clock}
            reduced={reduced}
          />
        ))}
      </View>
      <Animated.View style={[styles.splitLabels, labelsStyle]}>
        {splits.map((s, i) => (
          <View key={i} style={[styles.splitLabelSlot, { width: barWidth(slot, s.km) }]}>
            <Text numberOfLines={1} style={[styles.splitLabel, { width: slot }]}>{s.km < 1 ? tailLabel(s.km) : i + 1}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function SplitBar({ index, count, width, height, tail, c, styles, clock, reduced }: {
  index: number; count: number; width: number; height: number; tail: boolean;
  c: Palette; styles: ReturnType<typeof makeStyles>; clock: SharedValue<number>; reduced: boolean;
}) {
  // 가루가 80% 쌓이면 얼어붙는다: 막대가 떠오르고, 빛이 한 번 훑고 지나간다(약 360ms). 자투리는 옅게
  const freeze = freezeAt(index, count);
  const style = useAnimatedStyle(() => ({
    opacity: (reduced ? seg(clock.value, 0, MOTION.reduced) : sine(seg(clock.value, freeze - 240, freeze + 120))) * (tail ? 0.6 : 1),
  }));
  const shineStyle = useAnimatedStyle(() => {
    const p = reduced ? 1 : seg(clock.value, freeze, freeze + 360);
    return { opacity: p > 0 && p < 1 ? 1 : 0, transform: [{ translateX: -SHINE_W + (width + SHINE_W) * sine(p) }] };
  });
  return (
    <Animated.View style={[styles.splitBar, { width, height }, style]}>
      <LinearGradient colors={[c.value, withAlpha(c.value, c.dark ? 0.25 : 0.18)]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.shine, shineStyle]}>
        <LinearGradient colors={SHINE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </Animated.View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  head: { paddingHorizontal: 24, paddingRight: 86 },
  kicker: { ...monoLabel(12, 0.08), lineHeight: 18, color: c.text2 },
  title: { marginTop: 4, fontFamily: FONT.bold, fontSize: 20, lineHeight: 26, color: c.text },
  blueprint: { marginTop: 14, paddingHorizontal: 24 },
  logo: { position: 'absolute', left: 0, right: 0, height: 24, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { position: 'absolute', right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // 결과 시트: 화면 아래에서 올라오는 면. 저장 버튼 줄(footer)과 같은 색으로 이어진다
  sheet: {
    flexGrow: 1, marginTop: 12, paddingTop: 10, paddingBottom: 24, backgroundColor: c.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderTopColor: c.hair,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 10 },
  result: { paddingHorizontal: 24 },
  distanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  distance: { fontFamily: FONT.num, fontSize: 76, lineHeight: 80, letterSpacing: -1.5, color: c.text, fontVariant: ['tabular-nums'] },
  distanceInput: { padding: 0 },
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
  splitBar: { borderTopLeftRadius: 2, borderTopRightRadius: 2, overflow: 'hidden' },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SHINE_W },
  splitLabels: { marginTop: 3, flexDirection: 'row', gap: BAR_GAP },
  // 자투리 막대가 좁아도 라벨은 칸 폭으로 가운데 맞춤
  splitLabelSlot: { alignItems: 'center' },
  splitLabel: { textAlign: 'center', ...monoLabel(10, 0), lineHeight: 12, color: c.text2 },
  label: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  form: { marginTop: 20, paddingHorizontal: 24, gap: 12 },
  input: {
    height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.input, color: c.text, fontFamily: FONT.regular, fontSize: 15,
  },
  footer: { paddingHorizontal: 24, paddingTop: 8, backgroundColor: c.surface },
  saveBtn: { height: 54, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  footerRow: { flexDirection: 'row', gap: 10 },
  saveFlex: { flex: 1 },
  shareBtn: {
    height: 54, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1.5, borderColor: c.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  shareText: { fontFamily: FONT.semibold, fontSize: 16, color: c.text },
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
