import { useEffect, useState } from 'react';
import client from '@/api/client';

export interface CheerState {
  cheers: number;
  cheered: boolean;
}

interface Options {
  /** 내 러닝 등 누를 수 없을 때 */
  disabled?: boolean;
  /** 서버가 바뀐 값을 돌려준 뒤(이 화면에서 누른 경우만) */
  onCheered?: (next: CheerState) => void;
  /** 실패해 되돌린 뒤(own_run 403 · post_not_found 404 · 네트워크) */
  onError?: (error: unknown) => void;
}

// 같은 러닝을 보여 주는 다른 화면도 같은 값으로 맞춘다(러닝 상세 아래에 열려 있는 포스터 카드)
type Listener = (runId: string, next: CheerState) => void;
const listeners = new Set<Listener>();

// 응원 토글(POST /posts/run/:runId/cheer, 본문 없음 → 바뀐 { cheers, cheered }). 포스터 카드 · 러닝 상세 공용.
// 누르면 바로 화면에 반영하고 서버 값으로 맞춘다. 실패하면 누르기 전 값으로 되돌린다
export function useCheer(runId: string, initial: CheerState, { disabled = false, onCheered, onError }: Options = {}) {
  const [cheer, setCheer] = useState(initial);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const listener: Listener = (id, next) => { if (id === runId) setCheer(next); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [runId]);

  const toggle = async () => {
    if (disabled || sending) return;
    const before = cheer;
    setCheer({ cheers: before.cheers + (before.cheered ? -1 : 1), cheered: !before.cheered });
    setSending(true);
    try {
      const res = await client.post<CheerState>(`/posts/run/${runId}/cheer`);
      listeners.forEach((listener) => listener(runId, res.data));
      onCheered?.(res.data);
    } catch (e) {
      setCheer(before);
      onError?.(e);
    } finally {
      setSending(false);
    }
  };

  return { cheer, sending, toggle };
}
