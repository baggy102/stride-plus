import { newCells } from './new-cells';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 10, 21, 3);
// 위도 37.5 근처 동서 직선(약 400m, 점 간격 약 100m)
const line = (lat = 37.5): [number, number][] => Array.from({ length: 5 }, (_, i) => [127.0 + i * 0.00113, lat]);
const run = (id: string, daysAgo: number, route = line()) => ({ id, at: NOW - daysAgo * DAY, route });

describe('newCells', () => {
  it('이번 주 처음 지난 길은 전부 그 러닝이 연 칸이고, km는 경로 길이와 비슷하다', () => {
    const r = newCells([run('a', 1)], NOW);
    expect(r.cells.length).toBeGreaterThanOrEqual(8);
    expect(r.cells.every((c) => c.runId === 'a')).toBe(true);
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0].km).toBeGreaterThan(0.35);
    expect(r.runs[0].km).toBeLessThan(0.45);
  });

  it('10일 전 누가 지난 길이면 열린 칸이 없다', () => {
    const r = newCells([run('old', 10), run('a', 1)], NOW);
    expect(r.cells).toEqual([]);
    expect(r.runs).toEqual([]);
  });

  it('40일 전에만 지난 길(28일 넘게 비어 있음)은 다시 열린다', () => {
    const r = newCells([run('old', 40), run('a', 1)], NOW);
    expect(r.cells.length).toBeGreaterThan(0);
    expect(r.cells.every((c) => c.runId === 'a')).toBe(true);
  });

  it('이번 주 같은 길을 두 러닝이 지나면 연 러닝은 이른 것 하나', () => {
    const r = newCells([run('late', 1), run('early', 3)], NOW);
    expect(r.cells.every((c) => c.runId === 'early')).toBe(true);
    expect(r.runs.map((x) => x.runId)).toEqual(['early']);
  });

  it('8일 전 러닝은 이번 주가 아니라 세지 않는다', () => {
    expect(newCells([run('a', 8)], NOW).cells).toEqual([]);
  });

  it('겹치지 않는 길은 각자 연다', () => {
    const r = newCells([run('a', 1), run('b', 2, line(37.51))], NOW);
    expect(new Set(r.cells.map((c) => c.runId))).toEqual(new Set(['a', 'b']));
  });

  it('칸은 고정 격자라 요청 위치와 상관없이 같은 좌표다', () => {
    const a = newCells([run('a', 1)], NOW).cells.map((c) => `${c.lng},${c.lat}`).sort();
    const b = newCells([run('a', 1)], NOW + 1000).cells.map((c) => `${c.lng},${c.lat}`).sort();
    expect(a).toEqual(b);
  });

  it('돌려주는 점은 칸 중심이 아니라 그 칸 안에서 연 러닝이 실제로 지난 점이다', () => {
    const lat = 37.5003; // 50 m 칸 중심(위도)과 어긋난 동서 직선
    const r = newCells([run('a', 1, line(lat))], NOW);
    const dLat = 50 / 111320;
    const dLng = 50 / (111320 * Math.cos((37.5 * Math.PI) / 180));
    expect(r.cells.length).toBeGreaterThan(0);
    for (const c of r.cells) {
      expect(c.lat).toBeCloseTo(lat, 9);
      // 점이 들어 있는 칸 = 같은 칸이라 앱이 칸을 다시 구해도 같다
      expect(c.lng).toBeGreaterThanOrEqual(127.0);
      expect(c.lng).toBeLessThanOrEqual(127.0 + 4 * 0.00113);
      expect(Math.floor(c.lat / dLat)).toBe(Math.floor(lat / dLat));
      expect(Number.isFinite(Math.floor(c.lng / dLng))).toBe(true);
    }
  });
});
