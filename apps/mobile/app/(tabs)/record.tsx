import { useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRunStore } from '@/store/run';
import { useHaversine } from '@/hooks/useHaversine';
import { RunSummaryModal } from '@/components/RunSummaryModal';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(secPerKm: number) {
  if (secPerKm === 0) return "--'--\"";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

export default function RecordScreen() {
  const { isTracking, coordinates, elapsedSeconds, startTracking, stopTracking, resetRun } =
    useRunStore();
  const { distanceKm, paceSecPerKm } = useHaversine(coordinates, elapsedSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const summaryRef = useRef<ReturnType<typeof stopTracking> | null>(null);
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
    summaryRef.current = stopTracking();
  }, [stopTracking]);

  const handleModalClose = useCallback(() => {
    summaryRef.current = null;
  }, []);

  const summary = !isTracking && summaryRef.current ? summaryRef.current : null;

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <View className="flex-1 items-center justify-between py-10 px-6">
        <Text className="text-white text-xl font-bold tracking-widest">STRIDE+</Text>

        <View className="w-full gap-6">
          <View className="items-center">
            <Text className="text-zinc-400 text-sm uppercase tracking-widest mb-1">시간</Text>
            <Text className="text-white text-7xl font-mono font-bold tabular-nums">
              {formatTime(elapsedSeconds)}
            </Text>
          </View>

          <View className="flex-row justify-around">
            <View className="items-center">
              <Text className="text-zinc-400 text-sm uppercase tracking-widest mb-1">거리</Text>
              <Text className="text-white text-4xl font-bold tabular-nums">
                {distanceKm.toFixed(2)}
              </Text>
              <Text className="text-zinc-500 text-sm">km</Text>
            </View>
            <View className="items-center">
              <Text className="text-zinc-400 text-sm uppercase tracking-widest mb-1">페이스</Text>
              <Text className="text-white text-4xl font-bold tabular-nums">
                {formatPace(paceSecPerKm)}
              </Text>
              <Text className="text-zinc-500 text-sm">/km</Text>
            </View>
          </View>

          {isTracking && (
            <Text className="text-zinc-600 text-xs text-center">
              GPS 포인트: {coordinates.length}개
            </Text>
          )}
        </View>

        <View className="items-center gap-4">
          {!isTracking ? (
            <Pressable
              onPress={handleStart}
              className="bg-green-500 rounded-full w-28 h-28 items-center justify-center active:opacity-80"
            >
              <Text className="text-white text-xl font-bold">START</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleStop}
              className="bg-red-500 rounded-full w-28 h-28 items-center justify-center active:opacity-80"
            >
              <Text className="text-white text-xl font-bold">STOP</Text>
            </Pressable>
          )}
          {!isTracking && elapsedSeconds > 0 && !summary && (
            <Pressable onPress={resetRun}>
              <Text className="text-zinc-400 text-sm underline">초기화</Text>
            </Pressable>
          )}
        </View>
      </View>

      {summary && (
        <RunSummaryModal summary={summary} onClose={handleModalClose} />
      )}
    </SafeAreaView>
  );
}
