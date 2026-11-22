import { densityCells } from './density';

// 위도 37.5 근처 동서 직선(약 200m)
const line = (lat: number): [number, number][] => [[127.0, lat], [127.00226, lat]];

describe('densityCells', () => {
  it('같은 칸을 지난 서로 다른 러너 수를 센다(같은 사람은 한 번)', () => {
    const runs = ['a', 'b', 'c', 'a'].map((userId) => ({ userId, route: line(37.5) }));
    const cells = densityCells(runs, 50, 37.5);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.n === 3)).toBe(true);
  });

  it('3명 미만인 칸은 돌려주지 않는다', () => {
    const runs = ['a', 'b'].map((userId) => ({ userId, route: line(37.5) }));
    expect(densityCells(runs, 50, 37.5)).toEqual([]);
  });

  it('긴 구간도 칸을 건너뛰지 않는다(200m 구간 → 50m 칸 4개 이상)', () => {
    const runs = ['a', 'b', 'c'].map((userId) => ({ userId, route: line(37.5) }));
    expect(densityCells(runs, 50, 37.5).length).toBeGreaterThanOrEqual(4);
  });

  it('겹치지 않는 경로는 칸을 나눠 센다', () => {
    const runs = [
      ...['a', 'b', 'c'].map((userId) => ({ userId, route: line(37.5) })),
      ...['d', 'e'].map((userId) => ({ userId, route: line(37.51) })),
    ];
    const cells = densityCells(runs, 50, 37.5);
    expect(cells.every((c) => Math.abs(c.lat - 37.5) < 0.001)).toBe(true);
  });
});
