import { create } from 'zustand';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { haversineKm } from '@/utils/route';
import { nextWeakStreak } from '@/utils/gpsSignal';

export interface RunSummary {
  coordinates: [number, number][];
  /** 점마다 시작 후 흐른 시간(초, 일시정지 제외) — km 스플릿용 */
  routeTimes: number[];
  /** 거리에 넣지 않은 구간(재개 직후)의 끝 점 인덱스 — 스플릿도 같은 구간을 뺀다 */
  segmentBreaks: number[];
  distanceKm: number;
  elapsedSeconds: number;
  paceSecPerKm: number;
}

/** 종료 직전 기록 중 화면의 점 구름(창 좌표) — 요약 화면의 가루 전환이 여기서 출발한다 */
export interface SettleFrom {
  dots: [number, number][];
}

// 백그라운드에서 JS 타이머가 멈춰도 틀어지지 않게 경과 시간은 시작 시각 기준으로 계산한다.
// 일시정지한 시간(pausedMs)은 뺀다(B7)
export function elapsedSecondsSince(startedAtMs: number, nowMs: number, pausedMs = 0): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs - pausedMs) / 1000));
}

// GPS 오차 필터 — 정확도가 이보다 나쁜 점, 이보다 빠르게 움직인 점(순간 튐)은 버린다
const MAX_ACCURACY_M = 30;
const MAX_SPEED_MPS = 10;

// 위치 수집 방식: background = 화면이 꺼져도 계속, foreground = 앱이 보일 때만(백그라운드 업데이트를 못 켠 경우·Expo Go)
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
  segmentBreaks: number[];
  /** 정확도 불량으로 버린 위치의 연속 횟수 — 3번 이상이면 기록 중 화면에 GPS 약함 배너(isGpsWeak) */
  weakGpsStreak: number;
  /** 받은 점마다 누적한 거리(필터를 통과한 구간만) */
  distanceKm: number;
  lastSampleAt: number | null;
  elapsedSeconds: number;
  pendingSummary: RunSummary | null;
  settleFrom: SettleFrom | null;
  /** 이번이 내 몇 번째 러닝인지(「RUN/0427」, 러닝 요약 머리줄). 모르면 null */
  runNo: number | null;
  startTracking: (runNo?: number | null) => Promise<void>;
  stopTracking: () => RunSummary;
  pauseTracking: () => void;
  resumeTracking: () => void;
  resetRun: () => void;
  /** 포그라운드 구독으로 기록 중이면 백그라운드 수집으로 다시 바꿔 본다 */
  upgradeToBackground: () => Promise<void>;
  clearPendingSummary: () => void;
  setSettleFrom: (from: SettleFrom | null) => void;
  _tick: () => void;
  _addCoordinate: (lng: number, lat: number, accuracy?: number | null, timestamp?: number) => void;
}

let nativeWatchSub: Location.LocationSubscription | null = null;
let upgrading = false;

// src/tasks/locationTask.ts의 태스크 이름과 같아야 한다(순환 import를 피하려 문자열로 둔다)
const LOCATION_TASK = 'stride-run-location';

const TRACKING_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 3000,
  distanceInterval: 5,
};

// 백그라운드 업데이트를 시작한다. 실패하면(Expo Go 등) false.
// 앱이 보일 때 시작하면 「사용하는 동안」 권한만으로도 홈으로 나가거나 화면이 꺼져도 이어진다
// (iOS: UIBackgroundModes location + 파란 위치 표시, Android: 포그라운드 서비스 알림). Strava 등도 같은 방식.
// 예전에는 「항상」이 아니면 여기서 포기하고 앱이 보일 때만 받는 구독으로 내려가서, 홈으로 나가면 기록이 멈췄다(2026-11 테스터 제보).
// askAlways: 「항상」 허용을 한 번 물어본다(거부해도 기록은 백그라운드로 계속)
async function startBackgroundUpdates(askAlways: boolean): Promise<boolean> {
  try {
    if (askAlways) await Location.requestBackgroundPermissionsAsync().catch(() => {});
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
  segmentBreaks: [],
  weakGpsStreak: 0,
  distanceKm: 0,
  lastSampleAt: null,
  elapsedSeconds: 0,
  pendingSummary: null,
  settleFrom: null,
  runNo: null,

  _tick: () => {
    const { startedAt, pausedAt, pausedMs } = get();
    if (startedAt !== null) set({ elapsedSeconds: elapsedSecondsSince(startedAt, pausedAt ?? Date.now(), pausedMs) });
  },

  _addCoordinate: (lng, lat, accuracy, timestamp) => {
    if (get().isPaused) return;
    const weakGpsStreak = nextWeakStreak(get().weakGpsStreak, accuracy, MAX_ACCURACY_M);
    if (weakGpsStreak !== get().weakGpsStreak) set({ weakGpsStreak });
    if (weakGpsStreak > 0) return;
    const now = timestamp ?? Date.now();
    const { coordinates, routeTimes, segmentBreaks, distanceKm, lastSampleAt, skipNextSegment, startedAt, pausedMs } = get();
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
      coordinates: [...coordinates, [lng, lat]], routeTimes: [...routeTimes, time],
      segmentBreaks: prev && skipNextSegment ? [...segmentBreaks, coordinates.length] : segmentBreaks,
      distanceKm: distanceKm + addKm, lastSampleAt: now, skipNextSegment: false,
    });
  },

  startTracking: async (runNo = null) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('location_permission_denied');

    // 권한 순서: 사용 중 허용(위) → 항상 허용(startBackgroundUpdates). 항상 허용을 거부해도 백그라운드로 계속한다
    set({
      isTracking: true, isPaused: false, pausedAt: null, pausedMs: 0, skipNextSegment: false, runNo,
      startedAt: Date.now(), coordinates: [], routeTimes: [], segmentBreaks: [], weakGpsStreak: 0, distanceKm: 0, lastSampleAt: null, elapsedSeconds: 0,
    });

    if (await startBackgroundUpdates(true)) {
      set({ trackingMode: 'background' });
      return;
    }

    set({ trackingMode: 'foreground' });
    nativeWatchSub = await Location.watchPositionAsync(TRACKING_OPTIONS, (loc) => {
      useRunStore.getState()._addCoordinate(loc.coords.longitude, loc.coords.latitude, loc.coords.accuracy, loc.timestamp);
    });
  },

  stopTracking: () => {
    const { coordinates, routeTimes, segmentBreaks, startedAt, distanceKm, pausedAt, pausedMs } = get();
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

    const summary = { coordinates, routeTimes, segmentBreaks, distanceKm, elapsedSeconds, paceSecPerKm };
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
    isTracking: false, isPaused: false, pausedAt: null, pausedMs: 0, skipNextSegment: false, trackingMode: null, startedAt: null, coordinates: [], routeTimes: [], segmentBreaks: [], weakGpsStreak: 0, distanceKm: 0, lastSampleAt: null,
    elapsedSeconds: 0, pendingSummary: null, settleFrom: null,
  }),

  // 시작할 때 백그라운드 업데이트를 못 켰으면(포그라운드 구독으로 기록 중) 앱으로 돌아올 때마다 다시 시도한다
  upgradeToBackground: async () => {
    if (upgrading || !get().isTracking || get().trackingMode !== 'foreground') return;
    upgrading = true;
    try {
      if (!(await startBackgroundUpdates(false))) return;
      // 확인하는 사이 기록이 끝났으면 방금 켠 수집을 끈다
      if (!get().isTracking) {
        Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
        return;
      }
      nativeWatchSub?.remove();
      nativeWatchSub = null;
      set({ trackingMode: 'background' });
    } finally {
      upgrading = false;
    }
  },

  clearPendingSummary: () => set({ pendingSummary: null, settleFrom: null }),

  setSettleFrom: (from) => set({ settleFrom: from }),
}));

// 앱이 다시 보일 때(권한 변경 후 돌아올 때 포함)
AppState.addEventListener('change', (next) => {
  if (next === 'active') useRunStore.getState().upgradeToBackground();
});
