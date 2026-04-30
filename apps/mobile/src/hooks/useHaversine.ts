import { useMemo } from 'react';

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: [number, number], b: [number, number]): number {
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

interface RunMetrics {
  distanceKm: number;
  paceSecPerKm: number;
}

export function useHaversine(
  coordinates: [number, number][],
  elapsedSeconds: number,
): RunMetrics {
  return useMemo(() => {
    let total = 0;
    for (let i = 1; i < coordinates.length; i++) {
      total += haversineKm(coordinates[i - 1], coordinates[i]);
    }
    const paceSecPerKm = total > 0 ? elapsedSeconds / total : 0;
    return { distanceKm: total, paceSecPerKm };
  }, [coordinates, elapsedSeconds]);
}
