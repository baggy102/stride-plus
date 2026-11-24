import type { RunMarker } from '@/types/run';

// 포스터 카드 왼쪽 위 스티커(최대 2개, 이 순서로). 색은 팔레트 sticker 토큰(new → today)에서 고른다
export type StickerKind = 'dawn' | 'tenK' | 'new';
// 24시간 안 스티커는 「오늘」 — 지도 피드 NEW(이번 주 새 길)와 같은 말이 두 뜻이 되지 않게(2026-11-21)
export const STICKER_LABEL: Record<StickerKind, string> = { dawn: '새벽 러닝', tenK: '10K+', new: '오늘' };

const DAY_MS = 24 * 60 * 60 * 1000;

// 새벽 러닝: 출발 시각(올린 시각 − 달린 시간, 기기 시간대)이 4~8시. 10K+: 10 km 이상. NEW: 24시간 안에 올라옴
export function posterStickers(run: Pick<RunMarker, 'createdAt' | 'distanceKm' | 'paceSecPerKm'>, now: number): StickerKind[] {
  const uploaded = Date.parse(run.createdAt);
  if (!Number.isFinite(uploaded)) return run.distanceKm >= 10 ? ['tenK'] : [];
  const hour = new Date(uploaded - run.paceSecPerKm * run.distanceKm * 1000).getHours();
  const kinds: StickerKind[] = [];
  if (hour >= 4 && hour < 8) kinds.push('dawn');
  if (run.distanceKm >= 10) kinds.push('tenK');
  if (now - uploaded < DAY_MS) kinds.push('new');
  return kinds.slice(0, 2);
}
