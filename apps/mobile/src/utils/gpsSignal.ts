// GPS 수신 약함 판정: 정확도가 나빠 버린 위치가 WEAK_GPS_STREAK번 연속이면 약함, 좋은 위치 1번이면 해제(11.15 결정)
export const WEAK_GPS_STREAK = 3;

/** 위치 하나를 받은 뒤의 연속 버림 횟수. 정확도가 maxAccuracyM보다 나쁘면 +1, 아니면(정확도 없음 포함) 0 */
export function nextWeakStreak(streak: number, accuracy: number | null | undefined, maxAccuracyM: number): number {
  return accuracy != null && accuracy > maxAccuracyM ? streak + 1 : 0;
}

export function isGpsWeak(streak: number): boolean {
  return streak >= WEAK_GPS_STREAK;
}
