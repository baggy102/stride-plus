import { Platform } from 'react-native';
import { create } from 'zustand';
import * as Location from 'expo-location';

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

let webWatchId: number | null = null;
let nativeWatchSub: Location.LocationSubscription | null = null;

export const useRunStore = create<RunStore>((set, get) => ({
  isTracking: false,
  coordinates: [],
  elapsedSeconds: 0,

  _tick: () => set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 })),

  _addCoordinate: (lng, lat) =>
    set((s) => ({ coordinates: [...s.coordinates, [lng, lat]] })),

  startTracking: async () => {
    if (Platform.OS === 'web') {
      if (!navigator.geolocation) throw new Error('geolocation_not_supported');

      // 좌표 초기화 → getCurrentPosition으로 권한 요청 + 첫 좌표 즉시 확보
      set({ coordinates: [], elapsedSeconds: 0 });

      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            useRunStore.getState()._addCoordinate(pos.coords.longitude, pos.coords.latitude);
            resolve();
          },
          (err) => reject(new Error(err.message)),
          { enableHighAccuracy: false, timeout: 15000 },
        );
      });

      set({ isTracking: true });

      webWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          useRunStore.getState()._addCoordinate(pos.coords.longitude, pos.coords.latitude);
        },
        (err) => console.warn('[run] watchPosition error:', err.message),
        { enableHighAccuracy: false, maximumAge: 3000 },
      );
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('location_permission_denied');

    set({ isTracking: true, coordinates: [], elapsedSeconds: 0 });

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
    const { coordinates, elapsedSeconds } = get();

    if (Platform.OS === 'web') {
      if (webWatchId !== null) {
        navigator.geolocation.clearWatch(webWatchId);
        webWatchId = null;
      }
    } else {
      nativeWatchSub?.remove();
      nativeWatchSub = null;
    }

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

