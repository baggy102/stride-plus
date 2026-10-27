import { Platform } from 'react-native';
import { RunActivity, type RunActivityState } from '../../modules/run-activity';
import { useRunStore } from '@/store/run';
import { fitToBox } from '@/utils/route';

// 기록 상태를 잠금화면·다이내믹 아일랜드 Live Activity(iOS)에 옮긴다. _layout에서 한 번 import한다.
// 백그라운드 위치 태스크로 점이 들어와도 같은 스토어를 쓰므로 화면이 꺼져 있어도 갱신된다.

// Live Activity 갱신은 시스템 예산이 있다: 점마다가 아니라 이 간격 이상, 또는 상태(일시정지)가 바뀔 때만
const MIN_UPDATE_MS = 10_000;
const MAX_ROUTE_POINTS = 48;
// 위젯 경로 상자(96×64) 비율로 맞춘 뒤 0~1로
const BOX = { w: 96, h: 64, inset: 4 };

function routeForWidget(coords: [number, number][]): number[] {
  const step = Math.max(1, Math.ceil(coords.length / MAX_ROUTE_POINTS));
  const picked = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  return fitToBox(picked, BOX.w, BOX.h, BOX.inset).flatMap(([x, y]) => [
    Math.round((x / BOX.w) * 1000) / 1000,
    Math.round((y / BOX.h) * 1000) / 1000,
  ]);
}

function snapshot(): RunActivityState {
  const s = useRunStore.getState();
  const now = s.pausedAt ?? Date.now();
  const elapsedSec = s.startedAt !== null ? Math.max(0, (now - s.startedAt - s.pausedMs) / 1000) : 0;
  return {
    distanceKm: s.distanceKm,
    paceSecPerKm: s.distanceKm >= 0.05 ? elapsedSec / s.distanceKm : 0,
    elapsedSec,
    timerStartMs: (s.startedAt ?? Date.now()) + s.pausedMs,
    paused: s.isPaused,
    route: routeForWidget(s.coordinates),
  };
}

const runTag = (runNo: number | null) => (runNo !== null ? String(runNo).padStart(4, '0') : '----');

if (Platform.OS === 'ios' && RunActivity) {
  const native = RunActivity;
  let lastSent = 0;
  // 앱이 기록 중에 종료됐다가 다시 열리면 남은 위젯을 치운다
  if (!useRunStore.getState().isTracking) native.end().catch(() => {});
  useRunStore.subscribe((state, prev) => {
    if (state.isTracking && !prev.isTracking) {
      lastSent = Date.now();
      native.start(runTag(state.runNo), snapshot()).catch(() => {});
      return;
    }
    if (!state.isTracking && prev.isTracking) {
      native.end().catch(() => {});
      return;
    }
    if (!state.isTracking) return;
    const pauseChanged = state.isPaused !== prev.isPaused;
    const moved = state.coordinates !== prev.coordinates;
    if (pauseChanged || (moved && Date.now() - lastSent >= MIN_UPDATE_MS)) {
      lastSent = Date.now();
      native.update(snapshot()).catch(() => {});
    }
  });
}
