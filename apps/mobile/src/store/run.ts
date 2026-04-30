import { create } from 'zustand';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_LOCATION_TASK = 'bg-location';

export interface RunSummary {
  coordinates: [number, number][];
  distanceKm: number;
  elapsedSeconds: number;
  paceSecPerKm: number;
}

interface RunStore {
  isTracking: boolean;
  coordinates: [number, number][];
  elapsedSeconds: number;
  startTracking: () => Promise<void>;
  stopTracking: () => RunSummary;
  resetRun: () => void;
  _tick: () => void;
  _addCoordinate: (lng: number, lat: number) => void;
}

export const useRunStore = create<RunStore>((set, get) => ({
  isTracking: false,
  coordinates: [],
  elapsedSeconds: 0,

  _tick: () => set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 })),

  _addCoordinate: (lng, lat) =>
    set((s) => ({ coordinates: [...s.coordinates, [lng, lat]] })),

  startTracking: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('location_permission_denied');

    const bgStatus = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus.status !== 'granted') throw new Error('bg_location_permission_denied');

    set({ isTracking: true, coordinates: [], elapsedSeconds: 0 });

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 3000,
      distanceInterval: 5,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Stride+ 러닝 중',
        notificationBody: '백그라운드에서 GPS를 추적하고 있습니다.',
      },
    });
  },

  stopTracking: () => {
    const { coordinates, elapsedSeconds } = get();

    TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK).then((registered) => {
      if (registered) Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    });

    set({ isTracking: false });

    const distanceKm = calcTotalDistance(coordinates);
    const paceSecPerKm = distanceKm > 0 ? elapsedSeconds / distanceKm : 0;

    return { coordinates, distanceKm, elapsedSeconds, paceSecPerKm };
  },

  resetRun: () => set({ isTracking: false, coordinates: [], elapsedSeconds: 0 }),
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

// 백그라운드 태스크 — 파일 최상위에 등록해야 한다
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations: Location.LocationObject[] }).locations;
  if (!locations?.length) return;
  const { longitude, latitude } = locations[locations.length - 1].coords;
  useRunStore.getState()._addCoordinate(longitude, latitude);
});
