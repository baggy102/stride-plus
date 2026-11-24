import { requireOptionalNativeModule } from 'expo';

export interface RunActivityState {
  distanceKm: number;
  paceSecPerKm: number;
  elapsedSec: number;
  /** 경과 시간 기준 시작 시각(epoch ms, 일시정지 합을 더한 값) */
  timerStartMs: number;
  paused: boolean;
  /** x0, y0, x1, y1 … routeFormat이 grid1000이면 0~1000 정수 격자 96점(가로·세로 같은 배율), 아니면 옛 0~1 · 48점 */
  route: number[];
}

interface RunActivityNative {
  /** 이 바이너리 위젯이 읽는 경로 모양. 'grid1000'이면 0~1000 정수 격자 96점. 옛 바이너리에는 없다 */
  readonly routeFormat?: string;
  isSupported(): boolean;
  start(state: RunActivityState): Promise<void>;
  update(state: RunActivityState): Promise<void>;
  end(): Promise<void>;
}

// iOS 개발 빌드에만 있다. Android·Expo Go에서는 null이라 모든 호출이 아무 일도 하지 않는다
export const RunActivity = requireOptionalNativeModule<RunActivityNative>('RunActivity');
