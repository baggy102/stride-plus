import { trimHomeEnds } from './home-privacy';

// 위도 37.5에서 경도 0.001도 ≈ 88.4m
const LNG_STEP_METERS = 88.4;
const line = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [127 + i * 0.001, 37.5]);

describe('trimHomeEnds', () => {
  it('앞뒤 100m를 잘라 경계점을 보간한다', () => {
    const coords = line(11); // 약 884m
    const { coordinates } = trimHomeEnds(coords);
    const startOffset = ((coordinates[0][0] - 127) / 0.001) * LNG_STEP_METERS;
    const endOffset = ((127.01 - coordinates[coordinates.length - 1][0]) / 0.001) * LNG_STEP_METERS;
    expect(startOffset).toBeCloseTo(100, 0);
    expect(endOffset).toBeCloseTo(100, 0);
    // 원본 중간 점은 그대로 남는다
    expect(coordinates).toContainEqual(coords[5]);
    expect(coordinates).not.toContainEqual(coords[0]);
    expect(coordinates).not.toContainEqual(coords[10]);
  });

  it('times를 좌표와 같이 자르고 보간한다', () => {
    const coords = line(11);
    const times = coords.map((_, i) => i * 30);
    const result = trimHomeEnds(coords, times);
    expect(result.times).toHaveLength(result.coordinates.length);
    expect(result.times[0]).toBeGreaterThan(30);
    expect(result.times[0]).toBeLessThan(60);
  });

  it('200m 이하 경로는 가운데 한 점만 남긴다', () => {
    const result = trimHomeEnds(line(3), [0, 30, 60]); // 약 177m
    expect(result.coordinates).toHaveLength(1);
    expect(result.coordinates[0][0]).toBeCloseTo(127.001, 6);
    expect(result.times[0]).toBeCloseTo(30, 6);
  });

  it('times 길이가 다르면 빈 배열로 둔다', () => {
    expect(trimHomeEnds(line(11), [1, 2]).times).toEqual([]);
  });

  it('점이 2개 미만이면 그대로 둔다', () => {
    expect(trimHomeEnds([]).coordinates).toEqual([]);
    expect(trimHomeEnds([[127, 37.5]]).coordinates).toEqual([[127, 37.5]]);
  });
});
