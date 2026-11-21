import type { RunMarker } from '@/types/run';

// 지도 피드 상단 TOTAL · HYPE · NEW(2026-11-19 확정). 거리 칩은 없앴다
export type FeedFilter = 'total' | 'hype' | 'new';

export const FEED_FILTERS: { key: FeedFilter; label: string; a11y: string }[] = [
  { key: 'total', label: 'TOTAL', a11y: '전체 러닝' },
  { key: 'hype', label: 'HYPE', a11y: '응원 많이 받은 러닝' },
  { key: 'new', label: 'NEW', a11y: '이번 주 새 길' },
];

// HYPE: 응원을 이만큼 이상 받은 러닝
export const HYPE_MIN_CHEERS = 3;

export function isHype(run: Pick<RunMarker, 'cheers'>): boolean {
  return (run.cheers ?? 0) >= HYPE_MIN_CHEERS;
}

// NEW(2026-11-21 칸 중심): 이번 주 「새 길」 칸을 연 러닝. openers는 서버 GET /runs/new-cells의 runs[].runId
export function isOpener(run: Pick<RunMarker, '_id'>, openers: ReadonlySet<string>): boolean {
  return openers.has(run._id);
}

export function matchesFilter(run: Pick<RunMarker, '_id' | 'cheers'>, filter: FeedFilter, openers: ReadonlySet<string>): boolean {
  if (filter === 'hype') return isHype(run);
  if (filter === 'new') return isOpener(run, openers);
  return true;
}

// 사용자별 링 색 칸(0~3). 같은 사람은 늘 같은 칸
export const RUNNER_TONES = 4;
export function runnerTone(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return hash % RUNNER_TONES;
}

// WebView 안 style="background-image:url(...)"에 넣어도 되는 주소만(http(s), 따옴표·괄호·공백·꺾쇠 없음)
export function safeImageUrl(url: string | null | undefined, baseUrl: string): string | null {
  if (!url) return null;
  const full = url.startsWith('/') ? `${baseUrl}${url}` : url;
  if (!/^https?:\/\//.test(full) || /['"()\s<>\\]/.test(full)) return null;
  return full;
}

// NEW에서 고른 러닝 경로의 「새로 연 구간」(민트): 구간(i-1→i) 가운데 점의 서버 칸(cellMeters, 기준 위도 37.5 — 서버 new-cells와 같다)을
// 이 러닝이 열었으면 true. 연 구간이 없으면 null
export function freshSegments(
  main: [number, number][],
  cells: { lng: number; lat: number; runId: string }[],
  runId: string,
  cellMeters: number,
): boolean[] | null {
  const dLat = cellMeters / 111320;
  const dLng = cellMeters / (111320 * Math.cos((37.5 * Math.PI) / 180));
  const keyOf = (lng: number, lat: number) => `${Math.floor(lng / dLng)},${Math.floor(lat / dLat)}`;
  const opened = new Set(cells.filter((c) => c.runId === runId).map((c) => keyOf(c.lng, c.lat)));
  if (opened.size === 0) return null;
  const mask = main.slice(1).map((b, i) => opened.has(keyOf((main[i][0] + b[0]) / 2, (main[i][1] + b[1]) / 2)));
  return mask.some(Boolean) ? mask : null;
}
