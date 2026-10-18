import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const mockUsersService = {
  findById: jest.fn(),
  deleteAccount: jest.fn(),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get(UsersController);
    jest.clearAllMocks();
  });

  it('deleteMe — req.user.sub로 계정 삭제', async () => {
    mockUsersService.deleteAccount.mockResolvedValue(undefined);
    await controller.deleteMe({ user: { sub: 'u1' } });
    expect(mockUsersService.deleteAccount).toHaveBeenCalledWith('u1');
  });
});
