import { Platform } from 'react-native';
import { RunActivity, type RunActivityState } from '../../modules/run-activity';
import { useRunStore } from '@/store/run';
import { fitToBox } from '@/utils/route';
import { MIN_PACE_DISTANCE_KM } from '@/utils/pace';

// 기록 상태를 잠금화면·다이내믹 아일랜드 Live Activity(iOS)에 옮긴다. _layout에서 한 번 import한다.
// 백그라운드 위치 태스크로 점이 들어와도 같은 스토어를 쓰므로 화면이 꺼져 있어도 갱신된다.

// Live Activity 갱신은 시스템 예산이 있다: 점마다가 아니라 이 간격 이상, 또는 상태(일시정지)가 바뀔 때만
const MIN_UPDATE_MS = 10_000;
// 경로 점 상한(SPEC_LA4 3-1 권장 96). 위젯이 매끈하게 하기 전에 점이 적으면 모양이 많이 바뀐다
const MAX_ROUTE_POINTS = 96;
// 가로·세로 같은 배율로 0~1000 정수 격자에 맞춘다(북쪽 위). 위젯이 비율 그대로 다시 맞추므로 배율은 상관없고,
// 정수라 ContentState 인코딩이 짧다: 96점이면 경로 약 0.9KB, 전체 약 1KB(ActivityKit 한도 4KB)
const ROUTE_GRID = 1000;

// 경로 모양 확인: runtimeVersion이 appVersion 정책이라 이 JS가 OTA로 옛 바이너리에도 간다. 옛 위젯은 0~1 값에
// 상자 크기를 곱해 그리므로 0~1000을 받으면 경로가 화면 밖으로 사라진다. 새 위젯이 든 바이너리만 routeFormat을 내보내니
// 그 값이 'grid1000'일 때만 새 모양으로, 아니면(옛 바이너리 · 모듈 없음 · Android) 옛 모양 그대로 보낸다.
const GRID_ROUTE = RunActivity?.routeFormat === 'grid1000';

// 옛 모양(옛 위젯용, 그대로 둔다): 48점, 96×64 상자 비율로 맞춘 뒤 0~1 소수 셋째 자리
const LEGACY_MAX_ROUTE_POINTS = 48;
const LEGACY_BOX = { w: 96, h: 64, inset: 4 };

function legacyRouteForWidget(coords: [number, number][]): number[] {
  const step = Math.max(1, Math.ceil(coords.length / LEGACY_MAX_ROUTE_POINTS));
  const picked = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  return fitToBox(picked, LEGACY_BOX.w, LEGACY_BOX.h, LEGACY_BOX.inset).flatMap(([x, y]) => [
    Math.round((x / LEGACY_BOX.w) * 1000) / 1000,
    Math.round((y / LEGACY_BOX.h) * 1000) / 1000,
  ]);
}

function routeForWidget(coords: [number, number][]): number[] {
  if (!GRID_ROUTE) return legacyRouteForWidget(coords);
  const n = coords.length;
  // 번호 간격을 고르게, 출발 점과 마지막 점(지금 위치)은 늘 넣는다
  const picked =
    n <= MAX_ROUTE_POINTS
      ? coords
      : Array.from({ length: MAX_ROUTE_POINTS }, (_, i) => coords[Math.round((i * (n - 1)) / (MAX_ROUTE_POINTS - 1))]);
  return fitToBox(picked, ROUTE_GRID, ROUTE_GRID, 0).flatMap(([x, y]) => [Math.round(x), Math.round(y)]);
}

function snapshot(): RunActivityState {
  const s = useRunStore.getState();
  const now = s.pausedAt ?? Date.now();
  const elapsedSec = s.startedAt !== null ? Math.max(0, (now - s.startedAt - s.pausedMs) / 1000) : 0;
  return {
    distanceKm: s.distanceKm,
    paceSecPerKm: s.distanceKm >= MIN_PACE_DISTANCE_KM ? elapsedSec / s.distanceKm : 0,
    elapsedSec,
    timerStartMs: (s.startedAt ?? Date.now()) + s.pausedMs,
    paused: s.isPaused,
    route: routeForWidget(s.coordinates),
  };
}

if (Platform.OS === 'ios' && RunActivity) {
  const native = RunActivity;
  let lastSent = 0;
  // 앱이 기록 중에 종료됐다가 다시 열리면 남은 위젯을 치운다
  if (!useRunStore.getState().isTracking) native.end().catch(() => {});
  useRunStore.subscribe((state, prev) => {
    if (state.isTracking && !prev.isTracking) {
      lastSent = Date.now();
      native.start(snapshot()).catch(() => {});
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
