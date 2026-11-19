import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { StorageService } from '../storage/storage.service';

const mockRunsService = {
  findNearby: jest.fn(),
  findByUser: jest.fn(),
  findById: jest.fn(),
  density: jest.fn(),
};

const REQ = { user: { sub: 'me' } };

describe('RunsController', () => {
  let controller: RunsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [RunsController],
      providers: [
        { provide: RunsService, useValue: mockRunsService },
        { provide: StorageService, useValue: { save: jest.fn() } },
      ],
    }).compile();

    controller = module.get(RunsController);
    jest.clearAllMocks();
  });

  it('findRuns — userId 없으면 findNearby 호출', async () => {
    mockRunsService.findNearby.mockResolvedValue([]);
    await controller.findRuns(REQ, { lat: 37.5, lng: 127.0 });
    expect(mockRunsService.findNearby).toHaveBeenCalledWith('me', 37.5, 127.0, 5000);
  });

  it('findRuns — userId 있으면 findByUser 호출', async () => {
    mockRunsService.findByUser.mockResolvedValue([]);
    await controller.findRuns(REQ, { userId: '507f1f77bcf86cd799439011' });
    expect(mockRunsService.findByUser).toHaveBeenCalledWith(
      'me',
      '507f1f77bcf86cd799439011',
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('findRuns — from·to를 Date로 바꿔 findByUser에 넘긴다', async () => {
    mockRunsService.findByUser.mockResolvedValue([]);
    await controller.findRuns(REQ, {
      userId: '507f1f77bcf86cd799439011',
      from: '2026-10-31T15:00:00.000Z',
      to: '2026-11-30T15:00:00.000Z',
    });
    expect(mockRunsService.findByUser).toHaveBeenCalledWith(
      'me',
      '507f1f77bcf86cd799439011',
      undefined,
      undefined,
      new Date('2026-10-31T15:00:00.000Z'),
      new Date('2026-11-30T15:00:00.000Z'),
    );
  });

  it('findRuns — from이 to보다 늦거나 같으면 400(invalid_period)', () => {
    const userId = '507f1f77bcf86cd799439011';
    expect(() =>
      controller.findRuns(REQ, { userId, from: '2026-12-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }),
    ).toThrow(new BadRequestException('invalid_period'));
    expect(() =>
      controller.findRuns(REQ, { userId, from: '2026-11-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }),
    ).toThrow(BadRequestException);
    expect(mockRunsService.findByUser).not.toHaveBeenCalled();
  });

  it('findRuns — ISO 8601이지만 Date로 못 바꾸는 값(주차 표기)은 500 대신 400', () => {
    const userId = '507f1f77bcf86cd799439011';
    expect(() => controller.findRuns(REQ, { userId, from: '2026-W01' })).toThrow(new BadRequestException('invalid_period'));
    expect(mockRunsService.findByUser).not.toHaveBeenCalled();
  });

  it('findById — runsService.findById 호출', async () => {
    mockRunsService.findById.mockResolvedValue({ _id: 'run1' });
    const result = await controller.findById(REQ, 'run1');
    expect(result).toEqual({ _id: 'run1' });
    expect(mockRunsService.findById).toHaveBeenCalledWith('me', 'run1');
  });

  it('density — 칸 크기까지 서비스에 넘긴다', async () => {
    mockRunsService.density.mockResolvedValue([{ lng: 127, lat: 37.5, n: 3 }]);
    const result = await controller.density(REQ, { lat: 37.5, lng: 127, radius: 2000, cell: 50 });
    expect(mockRunsService.density).toHaveBeenCalledWith('me', 37.5, 127, 2000, 50);
    expect(result).toEqual([{ lng: 127, lat: 37.5, n: 3 }]);
  });
});
