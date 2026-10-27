import { create } from 'zustand';
import * as Location from 'expo-location';
import { haversineKm } from '@/utils/route';

export interface RunSummary {
  coordinates: [number, number][];
  /** 점마다 시작 후 흐른 시간(초, 일시정지 제외) — km 스플릿용 */
  routeTimes: number[];
  distanceKm: number;
  elapsedSeconds: number;
  paceSecPerKm: number;
}

// 백그라운드에서 JS 타이머가 멈춰도 틀어지지 않게 경과 시간은 시작 시각 기준으로 계산한다.
// 일시정지한 시간(pausedMs)은 뺀다(B7)
export function elapsedSecondsSince(startedAtMs: number, nowMs: number, pausedMs = 0): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs - pausedMs) / 1000));
}

// GPS 오차 필터 — 정확도가 이보다 나쁜 점, 이보다 빠르게 움직인 점(순간 튐)은 버린다
const MAX_ACCURACY_M = 30;
const MAX_SPEED_MPS = 10;

// 위치 수집 방식: background = 화면이 꺼져도 계속, foreground = 앱이 보일 때만(항상 허용 거부·Expo Go)
export type TrackingMode = 'background' | 'foreground';

interface RunStore {
  isTracking: boolean;
  /** 일시정지 중 — 시간이 멈추고 들어오는 위치는 버린다 */
  isPaused: boolean;
  pausedAt: number | null;
  /** 지금까지 일시정지한 시간 합계 */
  pausedMs: number;
  /** 재개 후 첫 점은 직전 점과 거리를 잇지 않는다(멈춘 동안 이동한 거리 제외) */
  skipNextSegment: boolean;
  trackingMode: TrackingMode | null;
  startedAt: number | null;
  coordinates: [number, number][];
  /** coordinates와 같은 길이. 점마다 시작 후 흐른 시간(초, 일시정지 제외) */
  routeTimes: number[];
  /** 마지막 점의 GPS 정확도(m) — 기록 중 상단 줄 */
  lastAccuracyM: number | null;
  /** 받은 점마다 누적한 거리(필터를 통과한 구간만) */
  distanceKm: number;
  lastSampleAt: number | null;
  elapsedSeconds: number;
  pendingSummary: RunSummary | null;
  startTracking: () => Promise<void>;
  stopTracking: () => RunSummary;
  pauseTracking: () => void;
  resumeTracking: () => void;
  resetRun: () => void;
  clearPendingSummary: () => void;
  _tick: () => void;
  _addCoordinate: (lng: number, lat: number, accuracy?: number | null, timestamp?: number) => void;
}

let nativeWatchSub: Location.LocationSubscription | null = null;

// src/tasks/locationTask.ts의 태스크 이름과 같아야 한다(순환 import를 피하려 문자열로 둔다)
const LOCATION_TASK = 'stride-run-location';

const TRACKING_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 3000,
  distanceInterval: 5,
};

// 항상 허용이면 백그라운드 업데이트를 시작하고, 아니거나 실패하면(Expo Go 등) false
async function startBackgroundUpdates(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status !== 'granted') return false;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      ...TRACKING_OPTIONS,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Stride+ 러닝 기록 중',
        notificationBody: '화면이 꺼져도 경로를 기록하고 있어요',
      },
    });
    return true;
  } catch {
    return false;
  }
}

export const useRunStore = create<RunStore>((set, get) => ({
  isTracking: false,
  isPaused: false,
  pausedAt: null,
  pausedMs: 0,
  skipNextSegment: false,
  trackingMode: null,
  startedAt: null,
  coordinates: [],
  routeTimes: [],
  lastAccuracyM: null,
  distanceKm: 0,
  lastSampleAt: null,
  elapsedSeconds: 0,
  pendingSummary: null,

  _tick: () => {
    const { startedAt, pausedAt, pausedMs } = get();
    if (startedAt !== null) set({ elapsedSeconds: elapsedSecondsSince(startedAt, pausedAt ?? Date.now(), pausedMs) });
  },

  _addCoordinate: (lng, lat, accuracy, timestamp) => {
    if (get().isPaused) return;
    if (accuracy != null && accuracy > MAX_ACCURACY_M) return;
    const now = timestamp ?? Date.now();
    const { coordinates, routeTimes, distanceKm, lastSampleAt, skipNextSegment, startedAt, pausedMs } = get();
    const prev = coordinates[coordinates.length - 1];
    let addKm = 0;
    if (prev && lastSampleAt !== null && !skipNextSegment) {
      addKm = haversineKm(prev, [lng, lat]);
      const seconds = (now - lastSampleAt) / 1000;
      if (seconds > 0 && (addKm * 1000) / seconds > MAX_SPEED_MPS) return;
    }
    const atSec = startedAt !== null ? Math.max(0, Math.round((now - startedAt - pausedMs) / 100) / 10) : 0;
    // 점 시간은 줄어들지 않게(서버도 줄어들면 버린다)
    const time = Math.max(atSec, routeTimes[routeTimes.length - 1] ?? 0);
    set({
      coordinates: [...coordinates, [lng, lat]], routeTimes: [...routeTimes, time], lastAccuracyM: accuracy ?? null,
      distanceKm: distanceKm + addKm, lastSampleAt: now, skipNextSegment: false,
    });
  },

  startTracking: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('location_permission_denied');

    // 권한 순서: 사용 중 허용(위) → 항상 허용(여기). 항상 허용을 거부해도 포그라운드로 계속한다
    set({
      isTracking: true, isPaused: false, pausedAt: null, pausedMs: 0, skipNextSegment: false,
      startedAt: Date.now(), coordinates: [], routeTimes: [], lastAccuracyM: null, distanceKm: 0, lastSampleAt: null, elapsedSeconds: 0,
    });

    if (await startBackgroundUpdates()) {
      set({ trackingMode: 'background' });
      return;
    }

    set({ trackingMode: 'foreground' });
    nativeWatchSub = await Location.watchPositionAsync(TRACKING_OPTIONS, (loc) => {
      useRunStore.getState()._addCoordinate(loc.coords.longitude, loc.coords.latitude, loc.coords.accuracy, loc.timestamp);
    });
  },

  stopTracking: () => {
    const { coordinates, routeTimes, startedAt, distanceKm, pausedAt, pausedMs } = get();
    const elapsedSeconds = startedAt !== null
      ? elapsedSecondsSince(startedAt, pausedAt ?? Date.now(), pausedMs)
      : get().elapsedSeconds;

    nativeWatchSub?.remove();
    nativeWatchSub = null;
    if (get().trackingMode === 'background') {
      Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
    }

    set({ isTracking: false, isPaused: false, pausedAt: null, pausedMs: 0, trackingMode: null, startedAt: null, elapsedSeconds });

    const paceSecPerKm = distanceKm > 0 ? elapsedSeconds / distanceKm : 0;

    const summary = { coordinates, routeTimes, distanceKm, elapsedSeconds, paceSecPerKm };
    set({ pendingSummary: summary });
    return summary;
  },

  // 위치 수집은 유지한 채 받은 점만 버린다 — 재개 즉시 기록되고 권한을 다시 묻지 않는다
  pauseTracking: () => {
    if (get().isTracking && !get().isPaused) set({ isPaused: true, pausedAt: Date.now() });
  },

  resumeTracking: () => {
    const { isPaused, pausedAt, pausedMs } = get();
    if (!isPaused || pausedAt === null) return;
    set({ isPaused: false, pausedAt: null, pausedMs: pausedMs + (Date.now() - pausedAt), skipNextSegment: true });
  },

  resetRun: () => set({
    isTracking: false, isPaused: false, pausedAt: null, pausedMs: 0, skipNextSegment: false, trackingMode: null, startedAt: null, coordinates: [], routeTimes: [], lastAccuracyM: null, distanceKm: 0, lastSampleAt: null,
    elapsedSeconds: 0, pendingSummary: null,
  }),

  clearPendingSummary: () => set({ pendingSummary: null }),
}));
