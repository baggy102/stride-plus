import { create } from 'zustand';
import * as Location from 'expo-location';

export interface RunSummary {
  coordinates: [number, number][];
  distanceKm: number;
  elapsedSeconds: number;
  paceSecPerKm: number;
}

// 백그라운드에서 JS 타이머가 멈춰도 틀어지지 않게 경과 시간은 시작 시각 기준으로 계산한다
export function elapsedSecondsSince(startedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

// GPS 오차 필터 — 정확도가 이보다 나쁜 점, 이보다 빠르게 움직인 점(순간 튐)은 버린다
const MAX_ACCURACY_M = 30;
const MAX_SPEED_MPS = 10;

// 위치 수집 방식: background = 화면이 꺼져도 계속, foreground = 앱이 보일 때만(항상 허용 거부·Expo Go)
export type TrackingMode = 'background' | 'foreground';

interface RunStore {
  isTracking: boolean;
  trackingMode: TrackingMode | null;
  startedAt: number | null;
  coordinates: [number, number][];
  /** 받은 점마다 누적한 거리(필터를 통과한 구간만) */
  distanceKm: number;
  lastSampleAt: number | null;
  elapsedSeconds: number;
  pendingSummary: RunSummary | null;
  startTracking: () => Promise<void>;
  stopTracking: () => RunSummary;
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
  trackingMode: null,
  startedAt: null,
  coordinates: [],
  distanceKm: 0,
  lastSampleAt: null,
  elapsedSeconds: 0,
  pendingSummary: null,

  _tick: () => {
    const { startedAt } = get();
    if (startedAt !== null) set({ elapsedSeconds: elapsedSecondsSince(startedAt, Date.now()) });
  },

  _addCoordinate: (lng, lat, accuracy, timestamp) => {
    if (accuracy != null && accuracy > MAX_ACCURACY_M) return;
    const now = timestamp ?? Date.now();
    const { coordinates, distanceKm, lastSampleAt } = get();
    const prev = coordinates[coordinates.length - 1];
    let addKm = 0;
    if (prev && lastSampleAt !== null) {
      addKm = haversineKm(prev, [lng, lat]);
      const seconds = (now - lastSampleAt) / 1000;
      if (seconds > 0 && (addKm * 1000) / seconds > MAX_SPEED_MPS) return;
    }
    set({ coordinates: [...coordinates, [lng, lat]], distanceKm: distanceKm + addKm, lastSampleAt: now });
  },

  startTracking: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('location_permission_denied');

    // 권한 순서: 사용 중 허용(위) → 항상 허용(여기). 항상 허용을 거부해도 포그라운드로 계속한다
    set({ isTracking: true, startedAt: Date.now(), coordinates: [], distanceKm: 0, lastSampleAt: null, elapsedSeconds: 0 });

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
    const { coordinates, startedAt, distanceKm } = get();
    const elapsedSeconds = startedAt !== null ? elapsedSecondsSince(startedAt, Date.now()) : get().elapsedSeconds;

    nativeWatchSub?.remove();
    nativeWatchSub = null;
    if (get().trackingMode === 'background') {
      Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
    }

    set({ isTracking: false, trackingMode: null, startedAt: null, elapsedSeconds });

    const paceSecPerKm = distanceKm > 0 ? elapsedSeconds / distanceKm : 0;

    const summary = { coordinates, distanceKm, elapsedSeconds, paceSecPerKm };
    set({ pendingSummary: summary });
    return summary;
  },

  resetRun: () => set({
    isTracking: false, trackingMode: null, startedAt: null, coordinates: [], distanceKm: 0, lastSampleAt: null,
    elapsedSeconds: 0, pendingSummary: null,
  }),

  clearPendingSummary: () => set({ pendingSummary: null }),
}));

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c =
    sinDLat * sinDLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

