import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { useRunStore } from '@/store/run';

// 백그라운드 위치 태스크. defineTask는 앱 진입 시 모듈 최상위에서 한 번 등록돼야 한다(app/_layout.tsx가 import).
export const LOCATION_TASK = 'stride-run-location';

TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { isTracking, _addCoordinate } = useRunStore.getState();
  if (!isTracking) return;
  for (const loc of data.locations) {
    _addCoordinate(loc.coords.longitude, loc.coords.latitude); // GeoJSON [lng, lat]
  }
});
