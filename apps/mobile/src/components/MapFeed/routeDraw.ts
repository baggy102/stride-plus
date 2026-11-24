/** 지도 위 경로를 어떻게 할지: 지운다 · 받는 중이라 그대로 둔다 · 이 경로를 그린다 */
export type RouteDraw<R> = 'clear' | 'wait' | R;

/**
 * 지도 피드의 고른 경로. 지도 위 경로는 지금 고른 러닝의 것일 때만 그린다.
 * 선택이 풀리거나 그 카드를 닫기 시작하면(×·빈 지도 탭, 카드가 내려가기 전) 바로 지운다.
 * 받아 둔 경로가 다른 러닝 것(선택이 바뀌어 다시 받는 중)이면 다시 그리지 않는다 — 앞 러닝의 경로를 끝 상태로 되살리던 문제.
 * 그릴 선이 없으면(경로 없음 · 못 받음) 지운다. 그릴 때는 받은 객체를 그대로 돌려줘 effect가 렌더마다 다시 돌지 않는다
 */
export function routeDraw<R extends { id: string; coords: readonly unknown[] }>(
  selectedId: string | null | undefined,
  closingId: string | null,
  route: R | null,
): RouteDraw<R> {
  if (!selectedId || closingId === selectedId) return 'clear';
  if (!route || route.id !== selectedId) return 'wait';
  return route.coords.length < 2 ? 'clear' : route;
}
