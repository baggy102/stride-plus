import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useRunStore } from '@/store/run';
import { useAuthStore } from '@/store/auth';
import { Wordmark } from '@/components/Wordmark';
import { HoldToStopButton } from '@/components/HoldToStopButton';
import { LocationPermissionSheet } from '@/components/LocationPermissionSheet';
import { TelemetryGrid, CoordLine } from '@/components/Telemetry';
import { LocateIcon, PlayIcon, WarnIcon } from '@/components/icons';
import { useTabBarClearance } from '@/components/FloatingTabBar';
import { fetchRunStats } from '@/api/stats';
import * as SecureStorage from '@/utils/secureStorage';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';
import { formatDuration, formatPace, MIN_PACE_DISTANCE_KM } from '@/utils/pace';

const EXPLAIN_SEEN_KEY = 'location_explain_seen';
// 상단 텔레메트리 줄은 글자 크기 설정을 키워도 1.2배까지만(왼쪽 글자와 가운데 로고가 겹치지 않게)
const TOP_MAX_SCALE = 1.2;

// Frost S06 기록 — 24px 격자 위 경로 점 구름(지도 대신) + 상단 텔레메트리 줄 + 거리 주 수치 + PACE·TIME.
// 시작 전에도 같은 배치를 쓰고 종료 버튼 자리에 시작 버튼을 둔다(2026-10-18 결정).
export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  // 높이는 화면 루트의 실제 높이 기준(창 크기 값이 다시 그릴 때 틀어지던 문제, 2026-10-19 QR)
  const [root, setRoot] = useState(() => ({ width: Dimensions.get('window').width, height: Dimensions.get('screen').height }));
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const {
    isTracking, isPaused, trackingMode, coordinates, distanceKm, elapsedSeconds, lastAccuracyM,
    startTracking, stopTracking, pauseTracking, resumeTracking,
  } = useRunStore();
  const userId = useAuthStore((s) => s.user?._id);
  // 50 m 전에는 페이스를 보여 주지 않는다(시작 직후 값이 튐)
  const paceSecPerKm = distanceKm >= MIN_PACE_DISTANCE_KM ? elapsedSeconds / distanceKm : 0;
  const tick = useRunStore((s) => s._tick);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [here, setHere] = useState<{ at: [number, number]; accuracy: number | null } | undefined>(undefined);
  const [explainVisible, setExplainVisible] = useState(false);
  const [denied, setDenied] = useState(false);
  // 「RUN/0427」 = 이번이 내 몇 번째 러닝인지(D5). 기록 중에는 고정
  const [runNo, setRunNo] = useState<number | null>(null);

  useEffect(() => {
    if (isTracking) {
      intervalRef.current = setInterval(tick, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTracking, tick]);

  // 시작 전 좌표·GPS 정확도: 이미 허용돼 있으면 마지막으로 알려진 위치
  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) setHere({ at: [pos.coords.longitude, pos.coords.latitude], accuracy: pos.coords.accuracy });
    })();
  }, []);

  useFocusEffect(useCallback(() => {
    if (!userId || useRunStore.getState().isTracking) return;
    fetchRunStats(userId).then((s) => setRunNo(s.runCount + 1)).catch(() => {});
  }, [userId]));

  const begin = useCallback(async () => {
    try {
      await startTracking(runNo);
      setDenied(false);
    } catch {
      setDenied(true);
    }
  }, [startTracking, runNo]);

  const handleStart = useCallback(async () => {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status === 'denied' && !fg.canAskAgain) {
      setDenied(true);
      return;
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    const seen = await SecureStorage.getItem(EXPLAIN_SEEN_KEY);
    if (bg.status !== 'granted' && !seen) {
      setExplainVisible(true);
      return;
    }
    begin();
  }, [begin]);

  const handleStop = useCallback(() => {
    stopTracking();
    router.push('/run-summary');
  }, [stopTracking, router]);

  // 상단 줄: 상태(READY · REC · PAUSED) + 이번 러닝 번호, 오른쪽 GPS 정확도
  const state = !isTracking ? 'READY' : isPaused ? 'PAUSED' : 'REC';
  const stateColor = isPaused ? c.warn : c.value;
  const runTag = runNo !== null ? ` · RUN/${String(runNo).padStart(4, '0')}` : '';
  const accuracy = isTracking ? lastAccuracyM : here?.accuracy ?? null;
  const gpsText = denied ? 'GPS OFF' : accuracy != null ? `GPS ±${Math.round(accuracy)}M` : 'GPS --';
  const current = coordinates.length > 0 ? coordinates[coordinates.length - 1] : here?.at;

  // 격자 높이: 수치(약 210)와 아래 버튼 영역을 뺀 나머지, 작은 화면에서도 겹치지 않게
  const gridTop = insets.top + 44;
  const controlSpace = isTracking ? insets.bottom + 24 + 130 : tabClearance + 20 + 120;
  const gridHeight = Math.round(Math.max(120, Math.min(root.height * 0.42, root.height - gridTop - 22 - 210 - controlSpace - 12)));
  const lap = `LAP ${String(Math.floor(distanceKm) + 1).padStart(2, '0')}`;
  // 상단 왼쪽 글자는 가운데 워드마크(71px) 왼쪽 끝을 넘지 않는다. 넘치면 끝(RUN 번호)부터 줄인다
  const stateMaxWidth = Math.max(0, (root.width - 48) / 2 - 71 / 2 - 8);

  return (
    <View style={styles.root} onLayout={(e) => setRoot({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {/* 격자 + 지금까지 달린 경로(점 구름) */}
      <View style={{ position: 'absolute', top: gridTop, left: 0 }}>
        {!denied && (
          <TelemetryGrid
            coords={coordinates}
            width={root.width}
            height={gridHeight}
            pulse={!isPaused && (isTracking || !!here)}
            showHead={!!here || isTracking}
            accessibilityLabel={isTracking ? '지금까지 달린 경로' : '현재 위치'}
          />
        )}
        {!denied && <CoordLine at={current} />}
      </View>

      {/* 상단 텔레메트리 줄 */}
      <View style={[styles.topBar, { top: insets.top + 12 }]}>
        <View accessibilityRole="text" accessibilityLabel={isTracking ? (isPaused ? '일시정지' : '기록 중') : '대기'} style={[styles.state, { maxWidth: stateMaxWidth }]}>
          {!denied && <View style={[styles.stateDot, { backgroundColor: stateColor }]} />}
          {!denied && (
            <Text style={[styles.topText, styles.stateText, { color: stateColor }]} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={TOP_MAX_SCALE}>
              {`${state}${runTag}`}
            </Text>
          )}
        </View>
        <View style={styles.logo} pointerEvents="none">
          <Wordmark width={71} />
        </View>
        <Text style={[styles.topText, { color: c.navOff }]} numberOfLines={1} maxFontSizeMultiplier={TOP_MAX_SCALE}>{gpsText}</Text>
      </View>

      {/* 항상 허용을 거부해 포그라운드로 기록 중 */}
      {isTracking && trackingMode === 'foreground' && (
        <View accessibilityRole="alert" style={[styles.banner, { top: insets.top + 38 }]}>
          <WarnIcon color={c.warn} />
          <Text style={styles.bannerText}>화면이 꺼지면 기록이 멈출 수 있어요</Text>
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.bannerBtn}>
            <Text style={styles.bannerBtnText}>설정</Text>
          </Pressable>
        </View>
      )}

      {denied ? (
        <View style={[styles.deniedCard, { marginTop: gridTop + gridHeight + 2 }]}>
          <View style={styles.deniedIcon}>
            <LocateIcon color={c.text} />
          </View>
          <Text style={styles.deniedTitle}>위치 권한이 꺼져 있어요</Text>
          <Text style={styles.deniedBody}>러닝 경로를 기록하려면 설정에서 위치 접근을 허용해 주세요.</Text>
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.deniedBtn}>
            <Text style={styles.deniedBtnText}>설정 열기</Text>
          </Pressable>
        </View>
      ) : (
        <View accessibilityLabel={isTracking ? '진행 중 러닝' : '러닝 대기'} style={[styles.stats, { marginTop: gridTop + gridHeight + 22 }]}>
          <View style={styles.distanceRow} accessible accessibilityLabel={`거리 ${distanceKm.toFixed(2)} km`}>
            <Text style={[styles.distance, !isTracking && styles.distanceIdle]}>{distanceKm.toFixed(2)}</Text>
            <Text style={styles.distanceUnit}>KM</Text>
          </View>
          <View style={styles.grid}>
            <View style={styles.cell}>
              <Text style={styles.label}>PACE</Text>
              <Text style={styles.value}>
                {formatPace(paceSecPerKm)}
                <Text style={styles.unit}> /KM</Text>
              </Text>
            </View>
            <View style={[styles.cell, styles.cellDivider]}>
              <Text style={styles.label}>TIME</Text>
              <Text style={styles.value}>{formatDuration(elapsedSeconds)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 시작 / 종료 — 기록 중에는 탭바를 숨기므로 아래 여백이 다르다 */}
      <View style={[styles.control, { bottom: isTracking ? insets.bottom + 24 : tabClearance + 20 }]}>
        {isTracking ? (
          <>
            {trackingMode === 'background' && <Text style={[styles.side, styles.sideLeft]}>◐ LOCK</Text>}
            <Text style={[styles.side, styles.sideRight]}>{lap}</Text>
            <HoldToStopButton
              paused={isPaused}
              onTap={isPaused ? resumeTracking : pauseTracking}
              onComplete={handleStop}
            />
          </>
        ) : (
          !denied && (
            <View style={styles.startWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="러닝 시작"
                onPress={handleStart}
                style={styles.startBtn}
              >
                <PlayIcon color={c.ink} />
              </Pressable>
              <Text style={styles.hint}>눌러서 시작</Text>
            </View>
          )
        )}
      </View>

      <LocationPermissionSheet
        visible={explainVisible}
        onContinue={async () => {
          setExplainVisible(false);
          await SecureStorage.setItem(EXPLAIN_SEEN_KEY, '1');
          begin();
        }}
        onLater={() => setExplainVisible(false)}
      />
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  topBar: { position: 'absolute', left: 24, right: 24, height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  topText: { ...monoLabel(10.5, 0.08), lineHeight: 20 },
  stateText: { flexShrink: 1 },
  logo: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  banner: {
    position: 'absolute', left: 16, right: 16, height: 60, paddingLeft: 16, paddingRight: 6, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.warnLine,
  },
  bannerText: { flex: 1, fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.text },
  bannerBtn: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  bannerBtnText: { fontFamily: FONT.semibold, fontSize: 14, color: c.text, textDecorationLine: 'underline' },
  stats: { paddingHorizontal: 24 },
  distanceRow: { flexDirection: 'row', alignItems: 'flex-start' },
  distance: { fontFamily: FONT.num, fontSize: 120, lineHeight: 112, letterSpacing: -3.6, color: c.text, fontVariant: ['tabular-nums'] },
  distanceIdle: { fontSize: 112, lineHeight: 104 },
  // 팔레트 토큰 이름이 value라 인라인 { color: c.value }는 reanimated 플러그인이 shared value로 오인해 경고한다 → StyleSheet로
  distanceUnit: { ...monoLabel(18), lineHeight: 18, marginTop: 10, marginLeft: 10, color: c.value },
  grid: { marginTop: 12, flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hair },
  cell: { flex: 1, gap: 10, paddingVertical: 14 },
  cellDivider: { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: c.hair },
  label: { ...monoLabel(10, 0.14), lineHeight: 12, color: c.navOff },
  value: { fontFamily: FONT.num, fontSize: 26, lineHeight: 28, color: c.text, fontVariant: ['tabular-nums'] },
  unit: { ...monoLabel(11, 0.06), color: c.navOff },
  control: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  side: { position: 'absolute', top: 46, ...monoLabel(10), lineHeight: 12, color: c.navOff },
  sideLeft: { left: 30 },
  sideRight: { right: 30 },
  startWrap: { alignItems: 'center', gap: 8 },
  startBtn: {
    width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.accent, borderWidth: 1, borderColor: c.stop.edge,
  },
  hint: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  deniedCard: {
    marginHorizontal: 16, padding: 20, borderRadius: 20, gap: 10,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  deniedIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' },
  deniedTitle: { marginTop: 4, fontFamily: FONT.semibold, fontSize: 19, lineHeight: 26, color: c.text },
  deniedBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2 },
  deniedBtn: { marginTop: 8, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  deniedBtnText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
});
