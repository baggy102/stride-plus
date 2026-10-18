import { Test } from '@nestjs/testing';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

const mockRunsService = {
  findNearby: jest.fn(),
  findByUser: jest.fn(),
  findById: jest.fn(),
};

const REQ = { user: { sub: 'me' } };

describe('RunsController', () => {
  let controller: RunsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [RunsController],
      providers: [{ provide: RunsService, useValue: mockRunsService }],
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
    );
  });

  it('findById — runsService.findById 호출', async () => {
    mockRunsService.findById.mockResolvedValue({ _id: 'run1' });
    const result = await controller.findById(REQ, 'run1');
    expect(result).toEqual({ _id: 'run1' });
    expect(mockRunsService.findById).toHaveBeenCalledWith('me', 'run1');
  });
});
