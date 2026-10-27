import client from './client';

// 사용자 러닝 누적(GET /runs/stats/:userId). 프로필 TOTAL과 기록 중 「내 n번째 러닝」
export interface RunStats {
  totalKm: number;
  runCount: number;
}

export async function fetchRunStats(userId: string): Promise<RunStats> {
  const res = await client.get<RunStats>(`/runs/stats/${userId}`);
  return res.data;
}
