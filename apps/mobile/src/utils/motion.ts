import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

// Frost 전환 길이(ms). 모두 ease-out cubic. 동작 줄이기 설정이면 150ms 크로스페이드로 대신한다
export const MOTION = {
  seal: 480, // 기록 중 → 잠금
  wake: 420, // 잠금 → 기록 중
  settle: 640, // 기록 중 → 요약
  file: 520, // 요약 → 앨범
  reduced: 150,
} as const;

export const easeOutCubic = Easing.out(Easing.cubic);

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}
