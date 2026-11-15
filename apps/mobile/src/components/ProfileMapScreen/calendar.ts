// 캘린더 보기 계산(달 범위 · 월요일 시작 격자 · 거리 단계). 화면과 떼어 단위 테스트한다

/** 거리 단계(5 km 미만 · 5~10 km · 10 km 이상)마다 원 지름(칸 대비) */
export const LEVEL_SIZE = [0.56, 0.78, 1] as const;

export function dayLevel(km: number): 0 | 1 | 2 {
  return km < 5 ? 0 : km < 10 ? 1 : 2;
}

/** 기기 시간대의 그 달 1일 0시 ~ 다음 달 1일 0시(미포함)를 ISO 시각으로. 서버 GET /runs from·to */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: new Date(year, month, 1).toISOString(), to: new Date(year, month + 1, 1).toISOString() };
}

/** 월요일 시작 격자: 1일 앞 빈 칸은 null, 이어서 1 ~ 말일 */
export function monthGrid(year: number, month: number): (number | null)[] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}
