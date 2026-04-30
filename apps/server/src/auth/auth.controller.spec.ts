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
    mockAuthService.register.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const dto = { email: 'a@b.com', password: 'pw', username: 'alice' };
    const result = await controller.register(dto as Parameters<typeof controller.register>[0]);
    expect(result).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(mockAuthService.register).toHaveBeenCalledWith('a@b.com', 'pw');
  });

  it('login — accessToken 반환하고 쿠키 설정', async () => {
    mockAuthService.login.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });
    const dto = { email: 'a@b.com', password: 'pw' };
    const res = { cookie: jest.fn() } as unknown as import('express').Response;
    const result = await controller.login(dto as Parameters<typeof controller.login>[0], res);
    expect(result).toEqual({ accessToken: 'at' });
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'rt', expect.any(Object));
  });

  it('refresh — authService.refresh 호출하고 쿠키 갱신', async () => {
    mockAuthService.refresh.mockResolvedValue({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
    });
    const req = { cookies: { refresh_token: 'old-rt' } } as unknown as import('express').Request;
    const res = { cookie: jest.fn() } as unknown as import('express').Response;
    const result = await controller.refresh(req, res);
    expect(result).toEqual({ accessToken: 'new-at' });
    expect(mockAuthService.refresh).toHaveBeenCalledWith('old-rt');
  });
});
