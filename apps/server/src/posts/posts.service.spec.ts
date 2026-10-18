import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { Post } from './posts.schema';
import { Run } from '../runs/runs.schema';

const RUN_ID = '64b7f0c2a1b2c3d4e5f60718';
const USER_ID = '64b7f0c2a1b2c3d4e5f60719';

const mockSave = jest.fn();
// new postModel(data) 호출을 흉내 낸다
const mockPostModel = jest.fn().mockImplementation((data) => ({ ...data, save: mockSave }));

const mockRunExec = jest.fn();
const mockRunModel = {
  findById: jest.fn(() => ({ lean: () => ({ exec: mockRunExec }) })),
};

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        { provide: getModelToken(Run.name), useValue: mockRunModel },
      ],
    }).compile();

    service = module.get(PostsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('run이 있으면 runId·userId로 저장하고 저장 결과를 돌려준다', async () => {
      mockRunExec.mockResolvedValue({ _id: RUN_ID, userId: USER_ID });
      const saved = { _id: 'p1', runId: RUN_ID, userId: USER_ID };
      mockSave.mockResolvedValue(saved);

      const result = await service.create(USER_ID, { runId: RUN_ID });

      expect(mockPostModel).toHaveBeenCalledWith({ runId: RUN_ID, userId: USER_ID });
      expect(result).toBe(saved);
    });

    it('run이 없으면 NotFoundException(run_not_found), 저장하지 않는다', async () => {
      mockRunExec.mockResolvedValue(null);

      await expect(service.create(USER_ID, { runId: RUN_ID })).rejects.toThrow(
        new NotFoundException('run_not_found'),
      );
      expect(mockPostModel).not.toHaveBeenCalled();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('dto.runId로 run을 조회한다', async () => {
      mockRunExec.mockResolvedValue({ _id: RUN_ID, userId: USER_ID });
      mockSave.mockResolvedValue({});

      await service.create(USER_ID, { runId: RUN_ID });

      expect(mockRunModel.findById).toHaveBeenCalledWith(RUN_ID);
    });
  });
});
