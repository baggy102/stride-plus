import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

const mockPostsService = {
  create: jest.fn(),
  cheer: jest.fn(),
  receivedSince: jest.fn(),
};

describe('PostsController', () => {
  let controller: PostsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: mockPostsService }],
    }).compile();

    controller = module.get(PostsController);
    jest.clearAllMocks();
  });

  it('create — req.user.sub와 dto를 서비스에 넘긴다', async () => {
    const created = { _id: 'p1' };
    mockPostsService.create.mockResolvedValue(created);
    const dto = { runId: '64b7f0c2a1b2c3d4e5f60718' };

    const result = await controller.create({ user: { sub: 'u1' } }, dto);

    expect(mockPostsService.create).toHaveBeenCalledWith('u1', dto);
    expect(result).toBe(created);
  });

  it('cheer — req.user.sub와 runId를 서비스에 넘긴다', async () => {
    mockPostsService.cheer.mockResolvedValue({ cheers: 1, cheered: true });
    const result = await controller.cheer({ user: { sub: 'u1' } }, 'r1');
    expect(mockPostsService.cheer).toHaveBeenCalledWith('u1', 'r1');
    expect(result).toEqual({ cheers: 1, cheered: true });
  });

  it('cheers/received — since를 Date로 바꿔 서비스에 넘긴다', async () => {
    mockPostsService.receivedSince.mockResolvedValue([{ runId: 'r1', count: 2 }]);
    const result = await controller.received({ user: { sub: 'u1' } }, '2026-11-20T00:00:00.000Z');
    expect(mockPostsService.receivedSince).toHaveBeenCalledWith('u1', new Date('2026-11-20T00:00:00.000Z'));
    expect(result).toEqual([{ runId: 'r1', count: 2 }]);
  });

  it('cheers/received — since가 없거나 날짜가 아니면 400', () => {
    expect(() => controller.received({ user: { sub: 'u1' } }, '')).toThrow(BadRequestException);
    expect(() => controller.received({ user: { sub: 'u1' } }, 'nope')).toThrow(BadRequestException);
    expect(mockPostsService.receivedSince).not.toHaveBeenCalled();
  });
});
