import { useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useRunStore } from '@/store/run';
import { useHaversine } from '@/hooks/useHaversine';
import { AppLogo } from '@/components/AppLogo';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

export default function RecordScreen() {
  const router = useRouter();
  const { isTracking, coordinates, elapsedSeconds, startTracking, stopTracking, resetRun } =
    useRunStore();
  const { distanceKm, paceSecPerKm } = useHaversine(coordinates, elapsedSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRunStore((s) => s._tick);

  useEffect(() => {
    if (isTracking) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTracking, tick]);

  const handleStart = useCallback(async () => {
    try {
      await startTracking();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      Alert.alert('권한 오류', `위치 권한이 필요합니다.\n(${msg})`);
    }
  }, [startTracking]);

  const handleStop = useCallback(() => {
    stopTracking();
    router.push('/run-summary');
  }, [stopTracking, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        <AppLogo />

        {/* 수치 영역 */}
        <View style={styles.statsBlock}>
          <View style={styles.center}>
            <Text style={styles.label}>시간</Text>
            <Text style={styles.timeValue}>{formatTime(elapsedSeconds)}</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.center}>
              <Text style={styles.label}>거리</Text>
              <Text style={[styles.statValue, { color: '#B3E5FC' }]}>
                {distanceKm.toFixed(2)}
              </Text>
              <Text style={styles.unit}>km</Text>
            </View>
            <View style={styles.center}>
              <Text style={styles.label}>페이스</Text>
              <Text style={styles.statValue}>{formatPace(paceSecPerKm)}</Text>
              <Text style={styles.unit}>/km</Text>
            </View>
          </View>

          {/* 트래킹 중 LIVE 인디케이터 */}
          {isTracking && (
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* START / STOP 버튼 */}
        <View style={styles.center}>
          {!isTracking ? (
            <Pressable
              onPress={handleStart}
              style={({ pressed }) => [
                styles.mainButton,
                { backgroundColor: '#B3E5FC', opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.buttonText, { color: '#01579B' }]}>START</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleStop}
              style={({ pressed }) => [
                styles.mainButton,
                { backgroundColor: '#EF4444', opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>STOP</Text>
            </Pressable>
          )}
          {!isTracking && elapsedSeconds > 0 && (
            <Pressable onPress={resetRun} style={{ marginTop: 16 }}>
              <Text style={styles.resetText}>초기화</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0A' },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  center: { alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  statsBlock: { width: '100%', gap: 24 },
  label: {
    color: '#808080',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  timeValue: {
    color: '#F5F5F5',
    fontSize: 72,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statValue: {
    color: '#F5F5F5',
    fontSize: 36,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  unit: { color: '#404040', fontSize: 14 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#81D4FA' },
  liveText: { color: '#808080', fontSize: 12, letterSpacing: 2 },
  mainButton: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 20, fontWeight: '700' },
  resetText: { color: '#404040', fontSize: 14, textDecorationLine: 'underline' },
});
