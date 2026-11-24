import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { RunsService, normalizeRouteTimes } from './runs.service';
import { Run } from './runs.schema';
import { startPublic, startPublicUpdate } from './start-point';
import { trimHomeEnds } from './home-privacy';
import { User } from '../users/users.schema';
import { Post } from '../posts/posts.schema';
import { Types } from 'mongoose';

const mockFind = jest.fn();
const mockExists = jest.fn();
const mockBulkWrite = jest.fn();

// new this.runModel(doc).save()도 흉내 낸다: 만든 문서를 그대로 저장해 돌려준다
const mockRunModel = Object.assign(
  jest.fn().mockImplementation((doc: Record<string, unknown>) => ({ ...doc, save: jest.fn().mockResolvedValue(doc) })),
  { find: mockFind, findById: jest.fn(), aggregate: jest.fn(), exists: mockExists, bulkWrite: mockBulkWrite },
);
const point = (coordinates: [number, number]) => ({ type: 'Point', coordinates });
const queryChain = (value: unknown) => ({
  select: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});
// 마커 조회 흉내: startPublic 검색(새 문서) · 원래 경로 검색(옛 문서) · 내 러닝의 원래 시작점($slice)에 각각 답한다
function answerMarkers({ fresh = [], legacy = [], own = [] }: { fresh?: unknown[]; legacy?: unknown[]; own?: unknown[] }) {
  const chains = { fresh: queryChain(fresh), legacy: queryChain(legacy), own: queryChain(own) };
  mockFind.mockImplementation((filter: { _id?: { $in?: unknown[] }; startPublic?: { $exists?: boolean } }) =>
    filter._id?.$in ? chains.own : filter.startPublic?.$exists === false ? chains.legacy : chains.fresh,
  );
  return chains;
}

const mockPostAggregate = jest.fn();
const mockPostModel = { aggregate: mockPostAggregate };

const VIEWER = '64b7f0c2a1b2c3d4e5f60700';
const BLOCKED = new Types.ObjectId('64b7f0c2a1b2c3d4e5f60701');
const BLOCKER = new Types.ObjectId('64b7f0c2a1b2c3d4e5f60702');
const leanExec = (value: unknown) => ({
  select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(value) }) }),
});
// 차단 관계: VIEWER가 BLOCKED를 차단했고, BLOCKER가 VIEWER를 차단했다
const mockUserModel = {
  findById: jest.fn(() => leanExec({ blocked: [BLOCKED] })),
  find: jest.fn(() => leanExec([{ _id: BLOCKER }])),
};

describe('RunsService', () => {
  let service: RunsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RunsService,
        { provide: getModelToken(Run.name), useValue: mockRunModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
      ],
    }).compile();

    service = module.get(RunsService);
    jest.clearAllMocks();
    mockPostAggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
    // 기본: 백필이 끝나 startPublic 없는 문서가 없다
    mockExists.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    mockBulkWrite.mockResolvedValue({});
  });

  describe('findNearby', () => {
    it('마커 DTO로 변환한다', async () => {
      const raw = [
        {
          _id: 'run1',
          userId: { _id: VIEWER, profileImageUrl: 'img.png' },
          distanceKm: 5.2,
          paceSecPerKm: 330,
          photoUrls: ['photo1.jpg'],
          startPublic: point([127.101, 37.501]),
          createdAt: new Date('2026-01-01'),
        },
      ];
      // 내 러닝: 원래 시작점은 경로의 첫 점을 따로 읽는다
      answerMarkers({ fresh: raw, own: [{ _id: 'run1', userId: new Types.ObjectId(VIEWER), route: { coordinates: [[127.1, 37.5]] } }] });

      const result = await service.findNearby(VIEWER, 37.5, 127.1);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        _id: 'run1',
        distanceKm: 5.2,
        paceSecPerKm: 330,
        thumbnailUrl: 'photo1.jpg',
        startPoint: [127.1, 37.5],
      });
    });

    it('러너 정보에 role을 함께 받는다(운영자 표시)', async () => {
      const populate = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate,
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.findNearby(VIEWER, 37.5, 127.1);

      expect(populate).toHaveBeenCalledWith('userId', expect.stringMatching(/\brole\b/));
    });

    it('photoUrls 없으면 thumbnailUrl은 null', async () => {
      const raw = [
        {
          _id: 'run2',
          userId: 'u1',
          distanceKm: 2,
          paceSecPerKm: 400,
          photoUrls: [],
          startPublic: point([126.9, 37.4]),
          createdAt: new Date(),
        },
      ];

      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(raw),
      });

      const result = await service.findNearby(VIEWER, 37.4, 126.9);
      expect(result[0].thumbnailUrl).toBeNull();
      // 코스 소개가 없으면 빈 문자열
      expect(result[0].description).toBe('');
    });

    it('기본 반경 5000m 적용', async () => {
      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.findNearby(VIEWER, 37.5, 127.0);

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          startPublic: expect.objectContaining({
            $near: expect.objectContaining({
              $maxDistance: 5000,
            }),
          }),
        }),
      );
    });

    it('커스텀 반경 적용', async () => {
      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.findNearby(VIEWER, 37.5, 127.0, 10000);

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          startPublic: expect.objectContaining({
            $near: expect.objectContaining({
              $maxDistance: 10000,
            }),
          }),
        }),
      );
    });

    it('넓은 반경에서도 결과를 500건으로 제한', async () => {
      const limit = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        limit,
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.findNearby(VIEWER, 37.5, 127.0, 300000);

      expect(limit).toHaveBeenCalledWith(500);
    });

    it('가린 시작점(startPublic)으로 찾고 경로(route)는 읽지 않는다 — 응답 모양은 그대로', async () => {
      const select = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        select,
        populate: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          { _id: 'run1', userId: { _id: 'u1' }, distanceKm: 3, paceSecPerKm: 300, photoUrls: [], startPublic: point([127.001, 37.5]), createdAt: new Date() },
        ]),
      });

      const [marker] = await service.findNearby(VIEWER, 37.5, 127.0, 2000);

      expect(mockFind).toHaveBeenCalledTimes(1);
      const [query] = mockFind.mock.calls[0];
      expect(query).not.toHaveProperty('route');
      expect(query.startPublic.$near).toEqual({ $geometry: { type: 'Point', coordinates: [127.0, 37.5] }, $maxDistance: 2000 });
      const fields: string[] = select.mock.calls[0][0].split(' ');
      expect(fields).not.toContain('route');
      expect(fields).not.toContain('routeTimes');
      expect(fields).not.toContain('startRaw');
      expect(fields).toEqual(expect.arrayContaining(['startPublic', 'userId', 'photoUrls', 'createdAt']));
      expect(Object.keys(marker).sort()).toEqual(
        ['_id', 'userId', 'distanceKm', 'paceSecPerKm', 'routeImageUrl', 'thumbnailUrl', 'photoUrls', 'description', 'startPoint', 'cheers', 'cheered', 'createdAt'].sort(),
      );
      expect(marker.startPoint).toEqual([127.001, 37.5]);
    });

    it('가린 시작점이 없는(null) 남의 러닝은 startPoint null — 원래 시작점으로 대신하지 않는다', async () => {
      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ _id: 'run1', userId: { _id: 'u1' }, startPublic: null, route: { coordinates: [[127, 37.5]] } }]),
      });
      const [marker] = await service.findNearby(VIEWER, 37.5, 127.0);
      expect(marker.startPoint).toBeNull();
    });
  });

  describe('백필 전 문서(startPublic 없음) — 읽을 때 계산해 채운다', () => {
    const OTHER = '64b7f0c2a1b2c3d4e5f60799';
    // 집(127, 37.5)에서 동쪽으로 약 880m. 원래 경로는 집을 지나고, 가린 시작점은 약 100m 동쪽
    const coordinates: [number, number][] = Array.from({ length: 11 }, (_, i) => [127 + i * 0.001, 37.5]);
    const legacyRun = (owner: string, _id = 'legacy1') => ({
      _id,
      userId: { _id: new Types.ObjectId(owner) },
      distanceKm: 0.88,
      route: { type: 'LineString', coordinates },
    });
    const withLegacy = () => mockExists.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'x' }) });
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    it('남아 있으면 원래 경로로 찾아 가린 시작점을 계산하고, 문서에 채운다(응답에 경로는 없다)', async () => {
      withLegacy();
      const legacyChain = answerMarkers({ legacy: [legacyRun(OTHER)] }).legacy;

      const [marker] = await service.findNearby(VIEWER, 37.5, 127.005, 2000);
      await flush();

      const legacyQuery = mockFind.mock.calls.map(([q]) => q).find((q) => q.startPublic?.$exists === false);
      expect(legacyQuery.route.$near.$maxDistance).toBe(2000);
      expect(legacyQuery.userId).toEqual({ $nin: [BLOCKED, BLOCKER] });
      expect(legacyChain.limit).toHaveBeenCalledWith(500);
      // 지금까지 남에게 보이던 시작점과 같다
      expect(marker.startPoint).toEqual(trimHomeEnds(coordinates).coordinates[0]);
      expect(marker).not.toHaveProperty('route');
      expect(mockBulkWrite).toHaveBeenCalledWith([startPublicUpdate('legacy1', coordinates)], { ordered: false });
    });

    it('내 옛 러닝은 원래 시작점', async () => {
      withLegacy();
      answerMarkers({ legacy: [legacyRun(VIEWER)], own: [{ _id: 'legacy1', route: { coordinates: [coordinates[0]] } }] });
      const [marker] = await service.findNearby(VIEWER, 37.5, 127.005, 2000);
      expect(marker.startPoint).toEqual(coordinates[0]);
    });

    it('원래 경로만 반경 안을 지나고 가린 시작점은 반경 밖이면 빠진다(값은 채운다)', async () => {
      withLegacy();
      answerMarkers({ legacy: [legacyRun(OTHER)] });
      // 집 바로 위, 반경 50m: 원래 경로는 지나지만 가린 시작점은 약 100m 밖
      expect(await service.findNearby(VIEWER, 37.5, 127, 50)).toEqual([]);
      await flush();
      expect(mockBulkWrite).toHaveBeenCalledTimes(1);
    });

    it('새 문서와 섞이면 시작점이 가까운 순, 같은 문서는 한 번', async () => {
      withLegacy();
      const far = { _id: 'fresh-far', userId: { _id: 'u1' }, startPublic: point([127.02, 37.5]) };
      answerMarkers({
        fresh: [far, { ...far, _id: 'legacy-near', startPublic: point([127.0011, 37.5]) }],
        legacy: [legacyRun(OTHER, 'legacy-near'), legacyRun(OTHER, 'legacy-2')],
      });
      const markers = await service.findNearby(VIEWER, 37.5, 127.001, 5000);
      expect(markers.map((m) => m._id)).toEqual(['legacy-near', 'legacy-2', 'fresh-far']);
    });

    it('남아 있지 않으면 원래 경로로 찾지 않는다', async () => {
      answerMarkers({ legacy: [legacyRun(OTHER)] });
      expect(await service.findNearby(VIEWER, 37.5, 127.005, 2000)).toEqual([]);
      expect(mockFind).toHaveBeenCalledTimes(1);
      expect(mockExists).toHaveBeenCalledWith({ startPublic: { $exists: false } });
      // 한 번 없다고 확인하면 다시 묻지 않는다
      await service.findNearby(VIEWER, 37.5, 127.005, 2000);
      expect(mockExists).toHaveBeenCalledTimes(1);
    });

    it('채우기가 실패해도 응답은 그대로', async () => {
      withLegacy();
      answerMarkers({ legacy: [legacyRun(OTHER)] });
      mockBulkWrite.mockRejectedValue(new Error('write failed'));
      const markers = await service.findNearby(VIEWER, 37.5, 127.005, 2000);
      await flush();
      expect(markers).toHaveLength(1);
    });
  });

  describe('create — 마커 시작점을 함께 저장', () => {
    const dto = (coordinates: [number, number][]) => ({ coordinates, distanceKm: 1, paceSecPerKm: 300 });
    const saved = () => mockRunModel.mock.calls[0][0];

    it('startPublic은 집 근처 100m를 자른 첫 점. 원래 시작점은 따로 저장하지 않는다', async () => {
      const coordinates: [number, number][] = Array.from({ length: 11 }, (_, i) => [127 + i * 0.001, 37.5]);
      await service.create(VIEWER, dto(coordinates));
      const doc = saved();
      expect(doc).not.toHaveProperty('startRaw');
      expect(doc.startPublic.type).toBe('Point');
      expect(doc.startPublic.coordinates).toEqual(trimHomeEnds(coordinates).coordinates[0]);
      // 약 100m(경도 0.001도 ≈ 88m) 안쪽
      expect(doc.startPublic.coordinates[0]).toBeGreaterThan(127.001);
      expect(doc.startPublic.coordinates[0]).toBeLessThan(127.0012);
    });

    it('200m 이하 짧은 러닝: 지금 남에게 보이는 것과 같이 가운데 한 점', async () => {
      const coordinates: [number, number][] = [[127, 37.5], [127.001, 37.5], [127.002, 37.5]]; // 약 177m
      await service.create(VIEWER, dto(coordinates));
      const doc = saved();
      expect(doc.startPublic.coordinates[0]).toBeCloseTo(127.001, 6);
    });

    it('빈 경로는 null — 남에게 마커로 잡히지 않는다', async () => {
      await service.create(VIEWER, dto([]));
      expect(saved()).toMatchObject({ startPublic: null });
    });
  });

  describe('findByUser', () => {
    it('userId로 런 목록 조회 — route 포함', async () => {
      const raw = [
        {
          _id: 'run1',
          userId: { _id: VIEWER, username: 'alice', profileImageUrl: null },
          distanceKm: 5.2,
          paceSecPerKm: 330,
          photoUrls: ['photo1.jpg'],
          description: '구성 코스',
          route: { type: 'LineString', coordinates: [[127.1, 37.5], [127.2, 37.6]] },
          createdAt: new Date('2026-01-01'),
        },
      ];

      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(raw),
      });

      const result = await service.findByUser(VIEWER, '64b7f0c2a1b2c3d4e5f60718');
      expect(result[0]).toMatchObject({
        _id: 'run1',
        distanceKm: 5.2,
        route: [[127.1, 37.5], [127.2, 37.6]],
        startPoint: [127.1, 37.5],
        description: '구성 코스',
      });
    });

    describe('기간(from·to)', () => {
      const USER = '64b7f0c2a1b2c3d4e5f60718';
      const chain = () => {
        const query = {
          select: jest.fn().mockReturnThis(),
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        };
        mockFind.mockReturnValue(query);
        return query;
      };

      it('기간을 주면 createdAt >= from, < to 조건 — 정렬·페이지는 그대로', async () => {
        const query = chain();
        // KST 11월: 2026-11-01 00:00 KST ~ 2026-12-01 00:00 KST(미포함)
        const from = new Date('2026-10-31T15:00:00.000Z');
        const to = new Date('2026-11-30T15:00:00.000Z');

        await service.findByUser(VIEWER, USER, 2, 10, from, to);

        const [filter] = mockFind.mock.calls[0];
        expect(filter.userId.equals(new Types.ObjectId(USER))).toBe(true);
        expect(filter.createdAt).toEqual({ $gte: from, $lt: to });
        expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(query.skip).toHaveBeenCalledWith(10);
        expect(query.limit).toHaveBeenCalledWith(10);
      });

      it('경계 — from 시각은 포함($gte), to 시각은 미포함($lt)', async () => {
        chain();
        const from = new Date('2026-10-31T15:00:00.000Z');
        const to = new Date('2026-11-30T15:00:00.000Z');

        await service.findByUser(VIEWER, USER, 1, 50, from, to);

        const { createdAt } = mockFind.mock.calls[0][0];
        expect(Object.keys(createdAt).sort()).toEqual(['$gte', '$lt']);
        expect(createdAt.$gte.getTime()).toBe(from.getTime());
        expect(createdAt.$lt.getTime()).toBe(to.getTime());
      });

      it('한쪽만 주면 그 조건만', async () => {
        chain();
        const from = new Date('2026-11-01T00:00:00.000Z');
        await service.findByUser(VIEWER, USER, 1, 50, from);
        expect(mockFind.mock.calls[0][0].createdAt).toEqual({ $gte: from });

        mockFind.mockClear();
        chain();
        const to = new Date('2026-12-01T00:00:00.000Z');
        await service.findByUser(VIEWER, USER, 1, 50, undefined, to);
        expect(mockFind.mock.calls[0][0].createdAt).toEqual({ $lt: to });
      });

      it('기간이 없으면 createdAt 조건 없이 기존과 같다', async () => {
        chain();
        await service.findByUser(VIEWER, USER);
        expect(mockFind.mock.calls[0][0]).not.toHaveProperty('createdAt');
      });
    });
  });

  describe('findById', () => {
    it('ID로 런 조회', async () => {
      const run = { _id: 'run1', distanceKm: 5 };
      mockRunModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(run),
      });

      const result = await service.findById(VIEWER, '64b7f0c2a1b2c3d4e5f60718');
      expect(result).toEqual({ ...run, cheers: 0, cheered: false });
    });

    it('없는 ID면 NotFoundException(run_not_found)', async () => {
      mockRunModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findById(VIEWER, '64b7f0c2a1b2c3d4e5f60718')).rejects.toThrow(
        new NotFoundException('run_not_found'),
      );
    });

    it('형식이 틀린 ID면 조회 없이 NotFoundException', async () => {
      await expect(service.findById(VIEWER, 'abc')).rejects.toThrow(new NotFoundException('run_not_found'));
      expect(mockRunModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('statsByUser', () => {
    const USER = '64b7f0c2a1b2c3d4e5f60703';

    it('사용자의 총 거리와 러닝 수를 집계한다', async () => {
      mockRunModel.aggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ _id: null, totalKm: 128.4, runCount: 27 }]) });
      await expect(service.statsByUser(VIEWER, USER)).resolves.toEqual({ totalKm: 128.4, runCount: 27 });
      const [pipeline] = mockRunModel.aggregate.mock.calls[0];
      expect(pipeline[0].$match.userId.equals(new Types.ObjectId(USER))).toBe(true);
    });

    it('기록이 없으면 0', async () => {
      mockRunModel.aggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      await expect(service.statsByUser(VIEWER, USER)).resolves.toEqual({ totalKm: 0, runCount: 0 });
    });

    it('차단 관계면 조회 없이 0', async () => {
      await expect(service.statsByUser(VIEWER, BLOCKED.toString())).resolves.toEqual({ totalKm: 0, runCount: 0 });
      expect(mockRunModel.aggregate).not.toHaveBeenCalled();
    });

    it('형식이 틀린 ID면 NotFoundException', async () => {
      await expect(service.statsByUser(VIEWER, 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('차단 필터(양방향)', () => {
    it('findNearby — 내가 차단한 사용자와 나를 차단한 사용자를 $nin으로 뺀다', async () => {
      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.findNearby(VIEWER, 37.5, 127.0);

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({ userId: { $nin: [BLOCKED, BLOCKER] } }),
      );
      expect(mockUserModel.find).toHaveBeenCalledWith({ blocked: new Types.ObjectId(VIEWER) });
    });

    it('findByUser — 차단 관계인 사용자의 목록은 조회 없이 빈 배열', async () => {
      expect(await service.findByUser(VIEWER, String(BLOCKED))).toEqual([]);
      expect(await service.findByUser(VIEWER, String(BLOCKER))).toEqual([]);
      expect(mockFind).not.toHaveBeenCalled();
    });

    it('findById — 차단 관계인 사용자의 러닝은 404', async () => {
      mockRunModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ _id: 'run1', userId: { _id: BLOCKER, username: 'x' } }),
      });

      await expect(service.findById(VIEWER, '64b7f0c2a1b2c3d4e5f60718')).rejects.toThrow(
        new NotFoundException('run_not_found'),
      );
    });
  });

  describe('density(D3 바탕)', () => {
    const chain = (value: unknown) => ({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });
    // 같은 동서 직선을 서로 다른 3명이 달림(약 880m)
    const route = Array.from({ length: 11 }, (_, i) => [127 + i * 0.001, 37.5]);
    const owners = ['64b7f0c2a1b2c3d4e5f60a01', '64b7f0c2a1b2c3d4e5f60a02', '64b7f0c2a1b2c3d4e5f60a03'];

    it('최근 7일 · 차단 제외 · 반경 조건으로 찾고, 3명이 지난 칸만 돌려준다', async () => {
      mockFind.mockReturnValue(chain(owners.map((id) => ({ userId: new Types.ObjectId(id), route: { coordinates: route } }))));
      const before = Date.now();
      const cells = await service.density(VIEWER, 37.5, 127.005, 2000, 50);

      const [query] = mockFind.mock.calls[0];
      expect(query.userId).toEqual({ $nin: [BLOCKED, BLOCKER] });
      expect(query.route.$near.$maxDistance).toBe(2000);
      const since = query.createdAt.$gte.getTime();
      expect(before - since).toBeGreaterThanOrEqual(7 * 24 * 3600 * 1000 - 1000);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every((c) => c.n === 3)).toBe(true);
    });

    it('남의 경로는 집 근처를 잘라 센다 — 출발점 칸은 나오지 않는다', async () => {
      mockFind.mockReturnValue(chain(owners.map((id) => ({ userId: new Types.ObjectId(id), route: { coordinates: route } }))));
      const cells = await service.density(VIEWER, 37.5, 127.005, 2000, 50);
      expect(cells.some((c) => c.lng < 127.0005)).toBe(false);
    });

    // 누출 회귀: 원래 경로가 지나서 $near 후보로 잡혀도, 자른 경로가 반경 안을 지나지 않으면 세지 않는다
    it('가린 구간(집 근처)만 반경 안을 지나는 남의 러닝은 세지 않는다', async () => {
      mockFind.mockReturnValue(chain(owners.map((id) => ({ userId: new Types.ObjectId(id), route: { coordinates: route } }))));
      // 출발점(집) 바로 위, 반경 50m: 원래 경로는 지나지만 자른 경로는 약 100m 밖
      expect(await service.density(VIEWER, 37.5, 127, 50, 50)).toEqual([]);
      // 같은 반경이라도 자른 경로가 지나는 곳이면 센다
      expect((await service.density(VIEWER, 37.5, 127.005, 50, 50)).length).toBeGreaterThan(0);
    });
  });

  describe('newCells(NEW · 이번 주 새 길)', () => {
    const chain = (value: unknown) => ({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });
    // 이번 주 한 번 지난 동서 직선(약 880m)
    const route = Array.from({ length: 11 }, (_, i) => [127 + i * 0.001, 37.5]);
    const RUN = new Types.ObjectId('64b7f0c2a1b2c3d4e5f60b01');

    it('최근 35일 · 차단 제외 · 반경 조건으로 찾고, 칸·연 러닝·km를 돌려준다', async () => {
      mockFind.mockReturnValue(chain([{ _id: RUN, createdAt: new Date(Date.now() - 24 * 3600 * 1000), route: { coordinates: route } }]));
      const before = Date.now();
      const result = await service.newCells(VIEWER, 37.5, 127.005, 2000);

      const [query] = mockFind.mock.calls[0];
      expect(query.userId).toEqual({ $nin: [BLOCKED, BLOCKER] });
      expect(query.route.$near.$maxDistance).toBe(2000);
      expect(before - query.createdAt.$gte.getTime()).toBeGreaterThanOrEqual(35 * 24 * 3600 * 1000 - 1000);
      expect(result.cellMeters).toBe(50);
      expect(result.cells.length).toBeGreaterThan(0);
      expect(result.cells.every((c) => c.runId === String(RUN))).toBe(true);
      expect(result.runs).toEqual([{ runId: String(RUN), km: expect.any(Number) }]);
      expect(result.runs[0].km).toBeGreaterThan(0.5);
    });

    it('출발·도착 100m는 잘라 센다 — 출발점 칸은 나오지 않는다(내 러닝도)', async () => {
      mockFind.mockReturnValue(chain([{ _id: RUN, createdAt: new Date(Date.now() - 3600 * 1000), route: { coordinates: route } }]));
      const result = await service.newCells(VIEWER, 37.5, 127.005, 2000);
      expect(result.cells.some((c) => c.lng < 127.0005)).toBe(false);
      expect(result.cells.some((c) => c.lng > 127.0095)).toBe(false);
    });

    // 누출 회귀: 원래 경로가 지나서 후보로 잡혀도, 자른 경로가 반경 안을 지나지 않으면 칸도 러닝도 나오지 않는다
    it('가린 구간(집 근처)만 반경 안을 지나는 러닝은 세지 않는다', async () => {
      mockFind.mockReturnValue(chain([{ _id: RUN, createdAt: new Date(Date.now() - 3600 * 1000), route: { coordinates: route } }]));
      expect(await service.newCells(VIEWER, 37.5, 127, 50)).toEqual({ cellMeters: 50, cells: [], runs: [] });
      expect((await service.newCells(VIEWER, 37.5, 127.005, 50)).cells.length).toBeGreaterThan(0);
    });
  });

  describe('응원 수(cheers)', () => {
    const RUN_A = new Types.ObjectId('64b7f0c2a1b2c3d4e5f60801');
    const RUN_B = new Types.ObjectId('64b7f0c2a1b2c3d4e5f60802');
    const chain = (value: unknown) => ({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });
    const runs = [RUN_A, RUN_B].map((_id) => ({ _id, userId: { _id: VIEWER }, route: { coordinates: [[127, 37.5]] } }));

    it('findNearby — 러닝마다 cheers·cheered, 포스트 없는 러닝은 0·false', async () => {
      mockFind.mockReturnValue(chain(runs));
      mockPostAggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ runId: RUN_A, cheers: 4, cheered: true }]) });

      const [a, b] = await service.findNearby(VIEWER, 37.5, 127);
      expect(a).toMatchObject({ cheers: 4, cheered: true });
      expect(b).toMatchObject({ cheers: 0, cheered: false });
      const [pipeline] = mockPostAggregate.mock.calls[0];
      expect(pipeline[0]).toEqual({ $match: { runId: { $in: [RUN_A, RUN_B] } } });
    });

    it('findByUser — 같은 방식으로 cheers·cheered', async () => {
      mockFind.mockReturnValue(chain(runs));
      mockPostAggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ runId: RUN_B, cheers: 2, cheered: false }]) });

      const [a, b] = await service.findByUser(VIEWER, VIEWER);
      expect(a).toMatchObject({ cheers: 0, cheered: false });
      expect(b).toMatchObject({ cheers: 2, cheered: false });
    });

    it('결과가 없으면 집계하지 않는다', async () => {
      mockFind.mockReturnValue(chain([]));
      expect(await service.findNearby(VIEWER, 37.5, 127)).toEqual([]);
      expect(mockPostAggregate).not.toHaveBeenCalled();
    });

    describe('findById(러닝 상세)', () => {
      const RUN_ID = String(RUN_A);
      const OTHER = new Types.ObjectId('64b7f0c2a1b2c3d4e5f60799');
      // 위도 37.5에서 경도 0.001도 ≈ 88m — 11점이면 약 880m
      const coordinates = Array.from({ length: 11 }, (_, i) => [127 + i * 0.001, 37.5]);
      const detail = (owner: Types.ObjectId | string) => ({
        _id: RUN_A,
        userId: { _id: new Types.ObjectId(String(owner)), username: 'runner' },
        distanceKm: 0.88,
        route: { type: 'LineString', coordinates },
        routeTimes: coordinates.map((_, i) => i * 30),
      });

      it('포스트가 없으면 0·false — 이 러닝 하나만 집계한다', async () => {
        mockRunModel.findById.mockReturnValue(chain(detail(OTHER)));

        const result = await service.findById(VIEWER, RUN_ID);
        expect(result).toMatchObject({ cheers: 0, cheered: false });
        const [pipeline] = mockPostAggregate.mock.calls[0];
        expect(pipeline[0]).toEqual({ $match: { runId: { $in: [RUN_A] } } });
        expect(pipeline[1].$project.cheered.$in[0].equals(new Types.ObjectId(VIEWER))).toBe(true);
      });

      it('내가 응원한 러닝 — 수와 cheered true, 집 근처 가림은 그대로', async () => {
        mockRunModel.findById.mockReturnValue(chain(detail(OTHER)));
        mockPostAggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ runId: RUN_A, cheers: 3, cheered: true }]) });

        const result = await service.findById(VIEWER, RUN_ID);
        expect(result).toMatchObject({ cheers: 3, cheered: true, distanceKm: 0.88 });
        expect(result.route.coordinates).not.toContainEqual(coordinates[0]);
        expect(result.routeTimes).toHaveLength(result.route.coordinates.length);
      });

      it('남들만 응원한 러닝 — 수는 세고 cheered false', async () => {
        mockRunModel.findById.mockReturnValue(chain(detail(OTHER)));
        mockPostAggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ runId: RUN_A, cheers: 5, cheered: false }]) });

        expect(await service.findById(VIEWER, RUN_ID)).toMatchObject({ cheers: 5, cheered: false });
      });

      it('내 러닝 — 받은 응원 수를 원본 경로와 함께', async () => {
        mockRunModel.findById.mockReturnValue(chain(detail(VIEWER)));
        mockPostAggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ runId: RUN_A, cheers: 2, cheered: false }]) });

        const result = await service.findById(VIEWER, RUN_ID);
        expect(result).toMatchObject({ cheers: 2, cheered: false });
        expect(result.route.coordinates).toEqual(coordinates);
      });

      it('차단 관계면 집계 없이 404', async () => {
        mockRunModel.findById.mockReturnValue(chain(detail(BLOCKED)));

        await expect(service.findById(VIEWER, RUN_ID)).rejects.toThrow(new NotFoundException('run_not_found'));
        expect(mockPostAggregate).not.toHaveBeenCalled();
      });
    });
  });

  describe('집 근처 가림(남의 러닝)', () => {
    // 위도 37.5에서 경도 0.001도 ≈ 88m — 11점이면 약 880m
    const coordinates = Array.from({ length: 11 }, (_, i) => [127 + i * 0.001, 37.5]);
    const routeTimes = coordinates.map((_, i) => i * 30);
    const OTHER = '64b7f0c2a1b2c3d4e5f60799';
    const chain = (value: unknown) => ({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    });
    const run = (owner: string) => ({
      _id: 'run1',
      userId: { _id: new Types.ObjectId(owner) },
      distanceKm: 0.88,
      route: { type: 'LineString', coordinates },
      routeTimes,
    });

    it('findNearby — 남에게는 가린 시작점(startPublic), 내게는 원래 시작점(내 러닝만 경로 첫 점을 따로 읽는다)', async () => {
      // 저장된 모양 그대로: 마커 조회는 경로 없이 가린 시작점만 읽는다
      const stored = (owner: string, _id: string) => ({ _id, userId: { _id: new Types.ObjectId(owner) }, distanceKm: 0.88, startPublic: startPublic(coordinates as [number, number][]) });
      const chains = answerMarkers({
        fresh: [stored(OTHER, 'other-run'), stored(VIEWER, 'my-run')],
        own: [{ _id: 'my-run', userId: new Types.ObjectId(VIEWER), route: { coordinates: [coordinates[0]] } }],
      });
      const [other, mine] = await service.findNearby(VIEWER, 37.5, 127);

      // 두 번째 조회는 결과 중 내 러닝만, 경로 첫 점 하나만(포함 투영)
      const [ownFilter] = mockFind.mock.calls.map(([q]) => q).filter((q) => q._id?.$in);
      expect(ownFilter._id.$in).toEqual(['my-run']);
      expect(ownFilter.userId.equals(new Types.ObjectId(VIEWER))).toBe(true);
      expect(chains.own.select).toHaveBeenCalledWith({ userId: 1, 'route.coordinates': { $slice: 1 } });
      expect(other.startPoint).not.toEqual(coordinates[0]);
      expect(other.startPoint?.[0]).toBeGreaterThan(127.001);
      expect(other.startPoint).toEqual(trimHomeEnds(coordinates as [number, number][]).coordinates[0]);
      expect(mine.startPoint).toEqual(coordinates[0]);
    });

    it('findByUser — 남의 목록은 경로 앞뒤를 자른다', async () => {
      mockFind.mockReturnValue(chain([run(OTHER)]));
      const [result] = await service.findByUser(VIEWER, OTHER);
      expect(result.route).not.toContainEqual(coordinates[0]);
      expect(result.route).not.toContainEqual(coordinates[10]);
      expect(result.startPoint).toEqual(result.route[0]);
      expect(result.distanceKm).toBe(0.88);
    });

    it('findById — 남의 러닝은 경로와 routeTimes를 같이 자르고, 내 러닝은 그대로', async () => {
      mockRunModel.findById.mockReturnValue(chain(run(OTHER)));
      const other = await service.findById(VIEWER, '64b7f0c2a1b2c3d4e5f60718');
      expect(other.route.coordinates).not.toContainEqual(coordinates[0]);
      expect(other.routeTimes).toHaveLength(other.route.coordinates.length);

      const mineRun = run(VIEWER);
      mockRunModel.findById.mockReturnValue(chain(mineRun));
      expect(await service.findById(VIEWER, '64b7f0c2a1b2c3d4e5f60718')).toEqual({ ...mineRun, cheers: 0, cheered: false });
    });
  });
});

describe('normalizeRouteTimes', () => {
  it('좌표와 길이가 같고 줄어들지 않으면 그대로 저장', () => {
    expect(normalizeRouteTimes([0, 3, 6.5], 3)).toEqual([0, 3, 6.5]);
  });

  it('보내지 않으면(이전 앱) 빈 배열', () => {
    expect(normalizeRouteTimes(undefined, 3)).toEqual([]);
  });

  it('길이가 다르거나 줄어들거나 음수면 빈 배열', () => {
    expect(normalizeRouteTimes([0, 3], 3)).toEqual([]);
    expect(normalizeRouteTimes([0, 5, 4], 3)).toEqual([]);
    expect(normalizeRouteTimes([-1, 2, 4], 3)).toEqual([]);
    expect(normalizeRouteTimes([0, Number.NaN, 4], 3)).toEqual([]);
  });
});
