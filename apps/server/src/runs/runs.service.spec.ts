import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { RunsService, normalizeRouteTimes } from './runs.service';
import { Run } from './runs.schema';
import { User } from '../users/users.schema';
import { Post } from '../posts/posts.schema';
import { Types } from 'mongoose';

const mockFind = jest.fn();

const mockRunModel = {
  find: mockFind,
  findById: jest.fn(),
  aggregate: jest.fn(),
};

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
          route: { type: 'LineString', coordinates: [[127.1, 37.5], [127.2, 37.6]] },
          createdAt: new Date('2026-01-01'),
        },
      ];

      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(raw),
      });

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

    it('photoUrls 없으면 thumbnailUrl은 null', async () => {
      const raw = [
        {
          _id: 'run2',
          userId: 'u1',
          distanceKm: 2,
          paceSecPerKm: 400,
          photoUrls: [],
          route: { type: 'LineString', coordinates: [[126.9, 37.4]] },
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
          route: expect.objectContaining({
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
          route: expect.objectContaining({
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
      expect(result).toEqual(run);
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

    it('findNearby — 남의 시작점은 출발점에서 100m 안쪽, 내 시작점은 원본', async () => {
      mockFind.mockReturnValue(chain([run(OTHER), run(VIEWER)]));
      const [other, mine] = await service.findNearby(VIEWER, 37.5, 127);
      expect(other.startPoint).not.toEqual(coordinates[0]);
      expect(other.startPoint?.[0]).toBeGreaterThan(127.001);
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
      expect(await service.findById(VIEWER, '64b7f0c2a1b2c3d4e5f60718')).toBe(mineRun);
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
