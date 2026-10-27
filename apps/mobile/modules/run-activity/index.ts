import { requireOptionalNativeModule } from 'expo';

export interface RunActivityState {
  distanceKm: number;
  paceSecPerKm: number;
  elapsedSec: number;
  /** 경과 시간 기준 시작 시각(epoch ms, 일시정지 합을 더한 값) */
  timerStartMs: number;
  paused: boolean;
  /** 0~1로 맞춘 x0, y0, x1, y1 … */
  route: number[];
}

interface RunActivityNative {
  isSupported(): boolean;
  start(runNo: string, state: RunActivityState): Promise<void>;
  update(state: RunActivityState): Promise<void>;
  end(): Promise<void>;
}

// iOS 개발 빌드에만 있다. Android·Expo Go에서는 null이라 모든 호출이 아무 일도 하지 않는다
export const RunActivity = requireOptionalNativeModule<RunActivityNative>('RunActivity');
