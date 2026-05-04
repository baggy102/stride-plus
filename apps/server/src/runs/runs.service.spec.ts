import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { RunsService } from './runs.service';
import { Run } from './runs.schema';

const mockFind = jest.fn();

const mockRunModel = {
  find: mockFind,
  findById: jest.fn(),
};

describe('RunsService', () => {
  let service: RunsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RunsService,
        { provide: getModelToken(Run.name), useValue: mockRunModel },
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
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(raw),
      });

      const result = await service.findNearby(37.5, 127.1);

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
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(raw),
      });

      const result = await service.findNearby(37.4, 126.9);
      expect(result[0].thumbnailUrl).toBeNull();
    });

    it('기본 반경 5000m 적용', async () => {
      mockFind.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.findNearby(37.5, 127.0);

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
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      await service.findNearby(37.5, 127.0, 10000);

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

      const result = await service.findByUser('u1');
      expect(result[0]).toMatchObject({
        _id: 'run1',
        distanceKm: 5.2,
        route: [[127.1, 37.5], [127.2, 37.6]],
        startPoint: [127.1, 37.5],
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

      const result = await service.findById('run1');
      expect(result).toEqual(run);
    });
  });
});
