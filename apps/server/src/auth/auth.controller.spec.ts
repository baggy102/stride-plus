import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get(AuthController);
    jest.clearAllMocks();
  });

  it('register — authService.register 호출', async () => {
    const user = { _id: 'u1', email: 'a@b.com', username: 'alice' };
    mockAuthService.register.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user });
    const dto = { email: 'a@b.com', password: 'pw', username: 'alice' };
    const result = await controller.register(dto as Parameters<typeof controller.register>[0]);
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', user });
    expect(mockAuthService.register).toHaveBeenCalledWith('alice', 'a@b.com', 'pw');
  });

  it('login — accessToken·refreshToken·user 반환', async () => {
    const user = { _id: 'u1', email: 'a@b.com', username: 'alice' };
    mockAuthService.login.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user });
    const dto = { email: 'a@b.com', password: 'pw' };
    const result = await controller.login(dto as Parameters<typeof controller.login>[0]);
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', user });
  });

  it('refresh — body의 refreshToken으로 갱신', async () => {
    mockAuthService.refresh.mockResolvedValue({ accessToken: 'new-at', refreshToken: 'new-rt' });
    const result = await controller.refresh({ refreshToken: 'old-rt' });
    expect(result).toEqual({ accessToken: 'new-at', refreshToken: 'new-rt' });
    expect(mockAuthService.refresh).toHaveBeenCalledWith('old-rt');
  });
});
