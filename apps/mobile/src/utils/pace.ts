// 페이스 표시 공통 규칙(러닝 중·요약·상세·카드·목록)
// 50 m 미만에서는 시간 ÷ 아주 작은 거리라 값이 튄다 → 기록 화면은 이 거리부터 페이스를 보여 준다
export const MIN_PACE_DISTANCE_KM = 0.2;
// 60분/km보다 느리면 걷기·정지로 보고 표시하지 않는다
const MAX_PACE_SEC_PER_KM = 3600;

export function formatPace(secPerKm: number): string {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm > MAX_PACE_SEC_PER_KM) return "--'--\"";
  // 전체 초를 먼저 반올림해야 5'59.6"가 5'60"이 되지 않는다
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}"`;
}

// 기록의 페이스 표시. 50 m 미만 기록은 기록 화면과 같이 표시하지 않는다(0.02 km에 32'19" 같은 값 방지).
// 저장된 페이스 값은 시간 계산(거리 × 페이스)에 그대로 쓰이므로 바꾸지 않고 표시만 거른다
export function formatRunPace(secPerKm: number, distanceKm: number): string {
  return distanceKm >= MIN_PACE_DISTANCE_KM ? formatPace(secPerKm) : formatPace(0);
}

// 기록 시간 「52:10」·「1:05:20」. 서버는 시간을 따로 저장하지 않아 거리 × 페이스로 구한다
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}
