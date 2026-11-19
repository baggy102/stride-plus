import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { PostsService } from './posts.service';
import { Post } from './posts.schema';
import { Run } from '../runs/runs.schema';
import { Types } from 'mongoose';

const RUN_ID = '64b7f0c2a1b2c3d4e5f60718';
const USER_ID = '64b7f0c2a1b2c3d4e5f60719';

const mockUpsertExec = jest.fn();
const mockPostModel = {
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(() => ({ exec: mockUpsertExec })),
};
const chain = (value: unknown) => ({ select: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(value) }) }) });

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
    it('run이 있으면 runId로 포스트를 upsert하고 결과를 돌려준다(이미 있으면 있던 포스트)', async () => {
      mockRunExec.mockResolvedValue({ _id: RUN_ID, userId: USER_ID });
      const saved = { _id: 'p1', runId: RUN_ID, userId: USER_ID };
      mockUpsertExec.mockResolvedValue(saved);

      const result = await service.create(USER_ID, { runId: RUN_ID });

      expect(mockPostModel.findOneAndUpdate).toHaveBeenCalledWith(
        { runId: RUN_ID },
        { $setOnInsert: { runId: RUN_ID, userId: USER_ID } },
        { upsert: true, new: true },
      );
      expect(result).toBe(saved);
    });

    it('run이 없으면 NotFoundException(run_not_found), 저장하지 않는다', async () => {
      mockRunExec.mockResolvedValue(null);

      await expect(service.create(USER_ID, { runId: RUN_ID })).rejects.toThrow(
        new NotFoundException('run_not_found'),
      );
      expect(mockPostModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('남의 run이면 ForbiddenException(not_run_owner), 저장하지 않는다', async () => {
      mockRunExec.mockResolvedValue({ _id: RUN_ID, userId: '64b7f0c2a1b2c3d4e5f607aa' });

      await expect(service.create(USER_ID, { runId: RUN_ID })).rejects.toThrow(
        new ForbiddenException('not_run_owner'),
      );
      expect(mockPostModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('dto.runId로 run을 조회한다', async () => {
      mockRunExec.mockResolvedValue({ _id: RUN_ID, userId: USER_ID });
      mockUpsertExec.mockResolvedValue({});

      await service.create(USER_ID, { runId: RUN_ID });

      expect(mockRunModel.findById).toHaveBeenCalledWith(RUN_ID);
    });
  });

  describe('cheer', () => {
    const OWNER = '64b7f0c2a1b2c3d4e5f607aa';
    const post = (likes: string[]) => ({ _id: 'p1', userId: new Types.ObjectId(OWNER), likes: likes.map((id) => new Types.ObjectId(id)) });

    it('아직 안 눌렀으면 likes에 넣고 cheered true', async () => {
      mockPostModel.findOne.mockReturnValue(chain(post([])));
      mockPostModel.findByIdAndUpdate.mockReturnValue(chain({ likes: [USER_ID] }));

      expect(await service.cheer(USER_ID, RUN_ID)).toEqual({ cheers: 1, cheered: true });
      const [id, update] = mockPostModel.findByIdAndUpdate.mock.calls[0];
      expect(id).toBe('p1');
      expect(update).toHaveProperty('$addToSet');
    });

    it('이미 눌렀으면 likes에서 빼고 cheered false', async () => {
      mockPostModel.findOne.mockReturnValue(chain(post([USER_ID])));
      mockPostModel.findByIdAndUpdate.mockReturnValue(chain({ likes: [] }));

      expect(await service.cheer(USER_ID, RUN_ID)).toEqual({ cheers: 0, cheered: false });
      expect(mockPostModel.findByIdAndUpdate.mock.calls[0][1]).toHaveProperty('$pull');
    });

    it('포스트가 없으면 NotFoundException(post_not_found)', async () => {
      mockPostModel.findOne.mockReturnValue(chain(null));
      await expect(service.cheer(USER_ID, RUN_ID)).rejects.toThrow(new NotFoundException('post_not_found'));
    });

    it('내 러닝이면 ForbiddenException(own_run), 바꾸지 않는다', async () => {
      mockPostModel.findOne.mockReturnValue(chain(post([])));
      await expect(service.cheer(OWNER, RUN_ID)).rejects.toThrow(new ForbiddenException('own_run'));
      expect(mockPostModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('형식이 틀린 ID면 조회 없이 NotFoundException', async () => {
      await expect(service.cheer(USER_ID, 'abc')).rejects.toThrow(new NotFoundException('post_not_found'));
      expect(mockPostModel.findOne).not.toHaveBeenCalled();
    });
  });
});
