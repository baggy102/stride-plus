import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

const mockJwtService = { verify: jest.fn() };
const mockReflector = { getAllAndOverride: jest.fn() };

function makeContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ headers, user: undefined }) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: mockJwtService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get(JwtAuthGuard);
    jest.clearAllMocks();
  });

  it('@Public 라우트는 통과', () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const ctx = makeContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('유효한 Bearer 토큰이면 통과하고 user 설정', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    mockJwtService.verify.mockReturnValue({ sub: 'u1', email: 'a@b.com' });

    const request = { headers: { authorization: 'Bearer valid-token' } };
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request['user']).toEqual({ sub: 'u1', email: 'a@b.com' });
  });

  it('Authorization 헤더 없으면 UnauthorizedException', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const ctx = makeContext();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('Bearer 형식이 아니면 UnauthorizedException', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const ctx = makeContext({ authorization: 'Basic abc123' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('JWT verify 실패 시 UnauthorizedException', () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    mockJwtService.verify.mockImplementation(() => { throw new Error('invalid'); });
    const ctx = makeContext({ authorization: 'Bearer bad-token' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('IS_PUBLIC_KEY로 reflector를 조회한다', () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const ctx = makeContext();
    guard.canActivate(ctx);
    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
  });
});
