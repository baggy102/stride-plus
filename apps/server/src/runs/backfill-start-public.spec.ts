import { startPublic, startPublicUpdate } from './start-point';

type Counts = { todo: number; scanned: number; updated: number; emptyRoute: number; left: number; strayRaw: number; rawRemoved: number };

// scripts/backfill-start-public.js(운영자가 돌리는 백필)의 반복 부분. 실제 DB 대신 아래 가짜 컬렉션에 돌린다
const { backfill } = require('../../scripts/backfill-start-public.js') as {
  backfill: (
    runs: unknown,
    update: typeof startPublicUpdate,
    options?: { dryRun?: boolean; batch?: number; log?: (line: string) => void },
  ) => Promise<Counts>;
};

type Doc = { _id: number; route?: { coordinates: [number, number][] }; startPublic?: unknown; startRaw?: unknown };
type Filter = { startPublic?: unknown; startRaw?: unknown; _id?: { $gt: number } };

// 스크립트가 쓰는 만큼만: countDocuments · updateMany(startRaw 지우기) · find(startPublic 없음, _id > n).sort._id.limit · bulkWrite(updateOne)
function fakeRuns(docs: Doc[]) {
  const matches = (d: Doc, f: Filter) =>
    ('startPublic' in f ? !('startPublic' in d) : true) &&
    ('startRaw' in f ? 'startRaw' in d : true) &&
    (f._id === undefined || d._id > f._id.$gt);
  const reads: number[] = [];
  return {
    docs,
    reads,
    countDocuments: async (f: Filter) => docs.filter((d) => matches(d, f)).length,
    updateMany: async (f: Filter, update: { $unset: Record<string, ''> }) => {
      const hit = docs.filter((d) => matches(d, f));
      hit.forEach((d) => Object.keys(update.$unset).forEach((k) => delete (d as Record<string, unknown>)[k]));
      return { modifiedCount: hit.length };
    },
    find: (f: Filter, options: { projection: Record<string, number> }) => {
      expect(options.projection).toEqual({ route: 1 });
      let limit = Infinity;
      const cursor = {
        sort: () => cursor,
        limit: (n: number) => { limit = n; return cursor; },
        toArray: async () => {
          const out = docs.filter((d) => matches(d, f)).sort((a, b) => a._id - b._id).slice(0, limit);
          reads.push(out.length);
          return out.map((d) => ({ _id: d._id, route: d.route }));
        },
      };
      return cursor;
    },
    bulkWrite: async (ops: ReturnType<typeof startPublicUpdate>[]) => {
      let modifiedCount = 0;
      for (const { updateOne } of ops) {
        const doc = docs.find((d) => d._id === updateOne.filter._id);
        if (doc && !('startPublic' in doc)) { Object.assign(doc, updateOne.update.$set); modifiedCount++; }
      }
      return { modifiedCount };
    },
  };
}

const line: [number, number][] = Array.from({ length: 11 }, (_, i) => [127 + i * 0.001, 37.5]);
const legacyDocs = (): Doc[] => [
  { _id: 1, route: { coordinates: line } },
  // 이미 채움(개발 중 버전이 원래 시작점도 남겼다)
  { _id: 2, route: { coordinates: line }, startPublic: { type: 'Point', coordinates: [1, 1] }, startRaw: { type: 'Point', coordinates: [127, 37.5] } },
  { _id: 3, route: { coordinates: [] } },
  { _id: 4, route: { coordinates: line } },
  { _id: 5 }, // 경로 없음
];

describe('backfill-start-public 스크립트', () => {
  it('startPublic 없는 문서만 배치로 채우고, 남은 startRaw는 지우고, 수를 센다', async () => {
    const runs = fakeRuns(legacyDocs());
    const counts = await backfill(runs, startPublicUpdate, { batch: 2 });
    expect(counts).toEqual({ todo: 4, scanned: 4, updated: 4, emptyRoute: 2, left: 0, strayRaw: 1, rawRemoved: 1 });
    expect(runs.reads).toEqual([2, 2, 0]);
    expect(runs.docs[0]).toEqual({ _id: 1, route: { coordinates: line }, startPublic: startPublic(line) });
    expect(runs.docs[1].startPublic).toEqual({ type: 'Point', coordinates: [1, 1] });
    expect(runs.docs[2]).toMatchObject({ startPublic: null });
    expect(runs.docs.some((d) => 'startRaw' in d)).toBe(false);
  });

  it('여러 번 돌려도 같다 — 두 번째는 읽을 것도 지울 것도 없다', async () => {
    const runs = fakeRuns(legacyDocs());
    await backfill(runs, startPublicUpdate);
    const after = JSON.stringify(runs.docs);
    expect(await backfill(runs, startPublicUpdate)).toEqual({ todo: 0, scanned: 0, updated: 0, emptyRoute: 0, left: 0, strayRaw: 0, rawRemoved: 0 });
    expect(JSON.stringify(runs.docs)).toBe(after);
  });

  it('--dry-run은 읽고 세기만 한다', async () => {
    const runs = fakeRuns(legacyDocs());
    const before = JSON.stringify(runs.docs);
    const lines: string[] = [];
    const counts = await backfill(runs, startPublicUpdate, { dryRun: true, batch: 3, log: (l) => lines.push(l) });
    expect(counts).toEqual({ todo: 4, scanned: 4, updated: 0, emptyRoute: 2, left: 4, strayRaw: 1, rawRemoved: 0 });
    expect(JSON.stringify(runs.docs)).toBe(before);
    // 좌표는 로그에 찍지 않는다
    expect(lines.join('\n')).not.toMatch(/127\.|37\.5/);
  });
});
