import { Test } from '@nestjs/testing';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

const mockPostsService = {
  create: jest.fn(),
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
});
