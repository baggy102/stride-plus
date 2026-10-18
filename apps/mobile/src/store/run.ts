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

interface RunStore {
  isTracking: boolean;
  startedAt: number | null;
  coordinates: [number, number][];
  elapsedSeconds: number;
  pendingSummary: RunSummary | null;
  startTracking: () => Promise<void>;
  stopTracking: () => RunSummary;
  resetRun: () => void;
  clearPendingSummary: () => void;
  _tick: () => void;
  _addCoordinate: (lng: number, lat: number) => void;
}

let nativeWatchSub: Location.LocationSubscription | null = null;

export const useRunStore = create<RunStore>((set, get) => ({
  isTracking: false,
  startedAt: null,
  coordinates: [],
  elapsedSeconds: 0,
  pendingSummary: null,

  _tick: () => {
    const { startedAt } = get();
    if (startedAt !== null) set({ elapsedSeconds: elapsedSecondsSince(startedAt, Date.now()) });
  },

  _addCoordinate: (lng, lat) =>
    set((s) => ({ coordinates: [...s.coordinates, [lng, lat]] })),

  startTracking: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('location_permission_denied');

    set({ isTracking: true, startedAt: Date.now(), coordinates: [], elapsedSeconds: 0 });

    nativeWatchSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      (loc) => {
        useRunStore.getState()._addCoordinate(loc.coords.longitude, loc.coords.latitude);
      },
    );
  },

  stopTracking: () => {
    const { coordinates, startedAt } = get();
    const elapsedSeconds = startedAt !== null ? elapsedSecondsSince(startedAt, Date.now()) : get().elapsedSeconds;

    nativeWatchSub?.remove();
    nativeWatchSub = null;

    set({ isTracking: false, startedAt: null, elapsedSeconds });

    const distanceKm = calcTotalDistance(coordinates);
    const paceSecPerKm = distanceKm > 0 ? elapsedSeconds / distanceKm : 0;

    const summary = { coordinates, distanceKm, elapsedSeconds, paceSecPerKm };
    set({ pendingSummary: summary });
    return summary;
  },

  resetRun: () => set({ isTracking: false, startedAt: null, coordinates: [], elapsedSeconds: 0, pendingSummary: null }),

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

function calcTotalDistance(coords: [number, number][]) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1], coords[i]);
  }
  return total;
}

