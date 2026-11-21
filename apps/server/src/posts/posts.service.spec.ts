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
  aggregate: jest.fn(),
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

  describe('receivedSince(응원 받은 순간)', () => {
    it('내 포스트에서 since 이후 응원만 러닝별로 센다', async () => {
      const RUN = new Types.ObjectId(RUN_ID);
      mockPostModel.aggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([{ _id: RUN, count: 2 }]) });
      const since = new Date('2026-11-20T00:00:00Z');

      expect(await service.receivedSince(USER_ID, since)).toEqual([{ runId: RUN_ID, count: 2 }]);
      const [pipeline] = mockPostModel.aggregate.mock.calls[0];
      expect(String(pipeline[0].$match.userId)).toBe(USER_ID);
      expect(pipeline[0].$match['cheerLog.at']).toEqual({ $gt: since });
      expect(pipeline[2].$match['cheerLog.at']).toEqual({ $gt: since });
    });

    it('받은 응원이 없으면 빈 배열', async () => {
      mockPostModel.aggregate.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      expect(await service.receivedSince(USER_ID, new Date())).toEqual([]);
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

    it('응원하면 누른 사람과 시각을 cheerLog에 남긴다(N1 집계)', async () => {
      mockPostModel.findOne.mockReturnValue(chain(post([])));
      mockPostModel.findByIdAndUpdate.mockReturnValue(chain({ likes: [USER_ID] }));

      await service.cheer(USER_ID, RUN_ID);
      const entry = mockPostModel.findByIdAndUpdate.mock.calls[0][1].$push.cheerLog;
      expect(String(entry.userId)).toBe(USER_ID);
      expect(entry.at).toBeInstanceOf(Date);
    });

    it('응원을 취소하면 그 사람의 cheerLog도 뺀다', async () => {
      mockPostModel.findOne.mockReturnValue(chain(post([USER_ID])));
      mockPostModel.findByIdAndUpdate.mockReturnValue(chain({ likes: [] }));

      await service.cheer(USER_ID, RUN_ID);
      const pull = mockPostModel.findByIdAndUpdate.mock.calls[0][1].$pull;
      expect(String(pull.cheerLog.userId)).toBe(USER_ID);
      expect(String(pull.likes)).toBe(USER_ID);
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
