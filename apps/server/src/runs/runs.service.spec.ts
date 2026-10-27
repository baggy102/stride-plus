import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { RunsService, normalizeRouteTimes } from './runs.service';
import { Run } from './runs.schema';
import { User } from '../users/users.schema';
import { Types } from 'mongoose';

const mockFind = jest.fn();

const mockRunModel = {
  find: mockFind,
  findById: jest.fn(),
  aggregate: jest.fn(),
};

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
      ],
    }).compile();

    service = module.get(RunsService);
    jest.clearAllMocks();
  });

  describe('findNearby', () => {
    it('마커 DTO로 변환한다', async () => {
      const raw = [
        {
          _id: 'run1',
          userId: { _id: 'u1', profileImageUrl: 'img.png' },
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
          userId: { _id: 'u1', username: 'alice', profileImageUrl: null },
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
