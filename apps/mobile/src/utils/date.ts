// Frost 날짜 표기 공통 규칙: 「10.16 목」, 시각은 「07:05」(24시간)
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDay(input: string | number | Date): string {
  const d = new Date(input);
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${WEEKDAYS[d.getDay()]}`;
}

export function formatClock(input: string | number | Date): string {
  const d = new Date(input);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
