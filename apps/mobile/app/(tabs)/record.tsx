import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useRunStore } from '@/store/run';
import { Wordmark } from '@/components/Wordmark';
import { RouteMap, type RouteMapHandle } from '@/components/RouteMap';
import { HoldToStopButton } from '@/components/HoldToStopButton';
import { LocationPermissionSheet } from '@/components/LocationPermissionSheet';
import { LocateIcon, PlayIcon, WarnIcon } from '@/components/icons';
import { useTabBarClearance } from '@/components/FloatingTabBar';
import * as SecureStorage from '@/utils/secureStorage';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import { withAlpha, type Palette } from '@/theme/colors';
import { formatPace, MIN_PACE_DISTANCE_KM } from '@/utils/pace';

const EXPLAIN_SEEN_KEY = 'location_explain_seen';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 확정 UI S06 기록 — 최종 보드 Record(B1: 지도 배경 + Barlow, LIVE 없음, 종료 A 강조색).
// 시작 전에도 같은 배치를 쓰고 종료 버튼 자리에 시작 버튼을 둔다(RecordStart 보드는 쓰지 않음, 2026-10-18 결정).
export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  const { height: screenHeight } = useWindowDimensions();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const {
    isTracking, isPaused, trackingMode, coordinates, distanceKm, elapsedSeconds,
    startTracking, stopTracking, pauseTracking, resumeTracking,
  } = useRunStore();
  // 50 m 전에는 페이스를 보여 주지 않는다(시작 직후 값이 튐)
  const paceSecPerKm = distanceKm >= MIN_PACE_DISTANCE_KM ? elapsedSeconds / distanceKm : 0;
  const tick = useRunStore((s) => s._tick);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<RouteMapHandle>(null);
  const [here, setHere] = useState<[number, number] | undefined>(undefined);
  const [explainVisible, setExplainVisible] = useState(false);
  const [denied, setDenied] = useState(false);

  const mapHeight = Math.round(screenHeight * 0.39);

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

  // 시작 전 지도 가운데: 이미 허용돼 있으면 마지막으로 알려진 위치
  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getLastKnownPositionAsync();
      if (pos) setHere([pos.coords.longitude, pos.coords.latitude]);
    })();
  }, []);

  const begin = useCallback(async () => {
    try {
      await startTracking();
      setDenied(false);
    } catch {
      setDenied(true);
    }
  }, [startTracking]);

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

  const gpsOk = coordinates.length > 0;

  return (
    <View style={styles.root}>
      {/* 지도 배경 + 내 경로 */}
      <View style={{ height: mapHeight }}>
        <RouteMap
          ref={mapRef}
          coordinates={coordinates}
          fallbackCenter={here}
          showCurrent
          fit="follow"
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(c.bg, 0.9), withAlpha(c.bg, 0)]}
          style={[styles.fadeTop, { height: insets.top + 64 }]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(c.bg, 0), c.bg]}
          style={styles.fadeBottom}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="내 위치로 이동"
          onPress={() => mapRef.current?.recenter()}
          style={styles.myLocBtn}
        >
          <LocateIcon color={c.value} size={20} />
        </Pressable>
      </View>

      {/* 위쪽: GPS 상태 + 워드마크 */}
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        {isTracking && (
          <View accessibilityRole="text" style={styles.gpsChip}>
            <View style={[styles.gpsDot, { backgroundColor: isPaused ? c.warn : gpsOk ? c.ok : c.muted }]} />
            <Text style={styles.gpsText}>{isPaused ? '일시정지' : gpsOk ? 'GPS 양호' : 'GPS 찾는 중'}</Text>
          </View>
        )}
        <View style={styles.logo} pointerEvents="none">
          <Wordmark width={71} />
        </View>
      </View>

      {/* 항상 허용을 거부해 포그라운드로 기록 중 */}
      {isTracking && trackingMode === 'foreground' && (
        <View accessibilityRole="alert" style={[styles.banner, { top: insets.top + 50 }]}>
          <WarnIcon color={c.warn} />
          <Text style={styles.bannerText}>화면이 꺼지면 기록이 멈출 수 있어요</Text>
          <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.bannerBtn}>
            <Text style={styles.bannerBtnText}>설정</Text>
          </Pressable>
        </View>
      )}

      {denied ? (
        <View style={styles.deniedCard}>
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
        <View accessibilityLabel={isTracking ? '진행 중 러닝' : '러닝 대기'} style={styles.stats}>
          <Text style={styles.label}>Time</Text>
          <Text style={styles.time}>{formatTime(elapsedSeconds)}</Text>
          <View style={styles.grid}>
            <View style={styles.cell}>
              <Text style={styles.label}>Distance</Text>
              <Text style={[styles.value, { color: c.value }]}>
                {distanceKm.toFixed(2)}
                <Text style={styles.unit}> KM</Text>
              </Text>
            </View>
            <View style={[styles.cell, styles.cellDivider]}>
              <Text style={styles.label}>Avg Pace</Text>
              <Text style={styles.value}>
                {formatPace(paceSecPerKm)}
                <Text style={styles.unit}> /KM</Text>
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* 시작 / 종료 — 기록 중에는 탭바를 숨기므로 아래 여백이 다르다 */}
      <View style={[styles.control, { bottom: isTracking ? insets.bottom + 28 : tabClearance + 20 }]}>
        {isTracking ? (
          <HoldToStopButton
            paused={isPaused}
            onTap={isPaused ? resumeTracking : pauseTracking}
            onComplete={handleStop}
          />
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
  fadeTop: { position: 'absolute', left: 0, right: 0, top: 0 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 },
  myLocBtn: {
    position: 'absolute', right: 16, bottom: 48,
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    shadowColor: c.shadow, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  topBar: { position: 'absolute', left: 16, right: 16, height: 32, flexDirection: 'row', alignItems: 'center' },
  gpsChip: {
    height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: withAlpha(c.surface, 0.92), borderWidth: 1, borderColor: c.border,
  },
  gpsDot: { width: 7, height: 7, borderRadius: 4 },
  gpsText: { fontFamily: FONT.semibold, fontSize: 12, color: c.text },
  logo: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  banner: {
    position: 'absolute', left: 16, right: 16, height: 60, paddingLeft: 16, paddingRight: 6, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.warnLine,
  },
  bannerText: { flex: 1, fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.text },
  bannerBtn: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  bannerBtnText: { fontFamily: FONT.semibold, fontSize: 14, color: c.text, textDecorationLine: 'underline' },
  stats: { marginTop: 14, paddingHorizontal: 24, alignItems: 'center' },
  label: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  time: { fontFamily: FONT.num, fontSize: 88, lineHeight: 96, color: c.text, fontVariant: ['tabular-nums'] },
  grid: {
    marginTop: 18, alignSelf: 'stretch', flexDirection: 'row',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.border,
  },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: c.border },
  value: { fontFamily: FONT.num, fontSize: 34, lineHeight: 42, color: c.text, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: FONT.num, fontSize: 14, color: c.text2 },
  control: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  startWrap: { alignItems: 'center', gap: 10 },
  startBtn: {
    width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.accent, borderWidth: 1, borderColor: c.stop.edge,
  },
  hint: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  deniedCard: {
    marginTop: 14, marginHorizontal: 16, padding: 20, borderRadius: 20, gap: 10,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  deniedIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' },
  deniedTitle: { marginTop: 4, fontFamily: FONT.semibold, fontSize: 19, lineHeight: 26, color: c.text },
  deniedBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2 },
  deniedBtn: { marginTop: 8, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  deniedBtnText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
});
