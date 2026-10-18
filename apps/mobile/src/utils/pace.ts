// 페이스 표시 공통 규칙(러닝 중·요약·상세·카드·목록)
// 50 m 미만에서는 시간 ÷ 아주 작은 거리라 값이 튄다 → 기록 화면은 이 거리부터 페이스를 보여 준다
export const MIN_PACE_DISTANCE_KM = 0.05;
// 60분/km보다 느리면 걷기·정지로 보고 표시하지 않는다
const MAX_PACE_SEC_PER_KM = 3600;

export function formatPace(secPerKm: number): string {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm > MAX_PACE_SEC_PER_KM) return "--'--\"";
  // 전체 초를 먼저 반올림해야 5'59.6"가 5'60"이 되지 않는다
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}"`;
}
