import { trimHomeEnds } from './home-privacy';
import { startPublic, startPublicUpdate } from './start-point';

// 위도 37.5에서 경도 0.001도 ≈ 88m
const line = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [127 + i * 0.001, 37.5]);

describe('startPublic', () => {
  it('집 근처를 자른 경로의 첫 점 — 남에게 보이던 시작점과 같고, 원래 첫 점이 아니다', () => {
    const coords = line(11);
    expect(startPublic(coords)).toEqual({ type: 'Point', coordinates: trimHomeEnds(coords).coordinates[0] });
    expect(startPublic(coords)?.coordinates).not.toEqual(coords[0]);
  });

  it('200m 이하 경로는 가운데 한 점', () => {
    expect(startPublic(line(3))?.coordinates[0]).toBeCloseTo(127.001, 6);
  });

  it('빈 경로는 null', () => {
    expect(startPublic([])).toBeNull();
  });

  it('고도 등 셋째 값은 버린다', () => {
    const coords = line(11).map(([lng, lat]) => [lng, lat, 30] as unknown as [number, number]);
    expect(startPublic(coords)?.coordinates).toHaveLength(2);
  });
});

describe('startPublicUpdate(서버 채우기·백필 공용)', () => {
  it('startPublic이 없는 문서만 고친다 — 다시 돌려도 이미 채운 문서는 건드리지 않는다. 원래 시작점은 쓰지 않는다', () => {
    const op = startPublicUpdate('id1', line(11));
    expect(op.updateOne.filter).toEqual({ _id: 'id1', startPublic: { $exists: false } });
    expect(op.updateOne.update).toEqual({ $set: { startPublic: startPublic(line(11)) } });
  });

  it('빈 경로는 null로 채워 다음 실행에서 다시 읽지 않는다', () => {
    expect(startPublicUpdate('id2', []).updateOne.update.$set).toEqual({ startPublic: null });
  });
});
