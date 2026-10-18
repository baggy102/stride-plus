import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const mockUsersService = {
  findById: jest.fn(),
  deleteAccount: jest.fn(),
  isBlocking: jest.fn(),
  block: jest.fn(),
  unblock: jest.fn(),
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

  it('getUser — 내가 차단했는지 blockedByMe로 알려 준다', async () => {
    mockUsersService.findById.mockResolvedValue({ _id: 'u2', username: 'bob' });
    mockUsersService.isBlocking.mockResolvedValue(true);
    const result = await controller.getUser({ user: { sub: 'u1' } }, 'u2');
    expect(result).toMatchObject({ _id: 'u2', blockedByMe: true });
    expect(mockUsersService.isBlocking).toHaveBeenCalledWith('u1', 'u2');
  });

  it('block / unblock — req.user.sub와 대상 ID 전달', async () => {
    await controller.block({ user: { sub: 'u1' } }, 'u2');
    await controller.unblock({ user: { sub: 'u1' } }, 'u2');
    expect(mockUsersService.block).toHaveBeenCalledWith('u1', 'u2');
    expect(mockUsersService.unblock).toHaveBeenCalledWith('u1', 'u2');
  });
});
