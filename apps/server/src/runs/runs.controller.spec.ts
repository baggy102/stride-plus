import { Test } from '@nestjs/testing';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

const mockRunsService = {
  findNearby: jest.fn(),
  findById: jest.fn(),
};

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

  it('findNearby — runsService.findNearby 호출', async () => {
    mockRunsService.findNearby.mockResolvedValue([]);
    const dto = { lat: 37.5, lng: 127.0, radius: undefined } as Parameters<typeof controller.findNearby>[0];
    await controller.findNearby(dto);
    expect(mockRunsService.findNearby).toHaveBeenCalledWith(37.5, 127.0, 5000);
  });

  it('findById — runsService.findById 호출', async () => {
    mockRunsService.findById.mockResolvedValue({ _id: 'run1' });
    const result = await controller.findById('run1');
    expect(result).toEqual({ _id: 'run1' });
    expect(mockRunsService.findById).toHaveBeenCalledWith('run1');
  });
});
