import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { RefreshToken } from './auth.schema';
import { UsersService } from '../users/users.service';

const mockRefreshTokenModel = {
  findOne: jest.fn(),
  create: jest.fn(),
};

const mockUsersService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mocked-token'),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('secret'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(RefreshToken.name), useValue: mockRefreshTokenModel },
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue('mocked-token');
    mockConfigService.get.mockReturnValue('secret');
  });

  describe('register', () => {
    it('새 유저를 생성하고 ID/이메일 반환', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ _id: 'u1', email: 'a@b.com' });

      const result = await service.register('a@b.com', 'password123');

      expect(result).toEqual({ id: 'u1', email: 'a@b.com' });
      expect(mockUsersService.create).toHaveBeenCalledWith('a@b.com', expect.any(String));
    });

    it('이미 존재하는 이메일이면 ConflictException', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ _id: 'u1', email: 'a@b.com' });

      await expect(service.register('a@b.com', 'pw')).rejects.toThrow(ConflictException);
    });

    it('비밀번호를 해싱해서 저장', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({ _id: 'u1', email: 'a@b.com' });

      await service.register('a@b.com', 'plaintext');

      const hashedPw = mockUsersService.create.mock.calls[0][1];
      const matches = await bcrypt.compare('plaintext', hashedPw);
      expect(matches).toBe(true);
    });
  });

  describe('login', () => {
    it('유효한 인증 정보로 토큰 발급', async () => {
      const user = {
        _id: { toString: () => 'u1' },
        email: 'a@b.com',
        passwordHash: await bcrypt.hash('pw', 10),
      };
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockRefreshTokenModel.create.mockResolvedValue({});

      const result = await service.login('a@b.com', 'pw');

      expect(result).toEqual({ accessToken: 'mocked-token', refreshToken: 'mocked-token' });
    });

    it('이메일 없으면 UnauthorizedException', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login('x@b.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('비밀번호 틀리면 UnauthorizedException', async () => {
      const user = {
        _id: { toString: () => 'u1' },
        email: 'a@b.com',
        passwordHash: await bcrypt.hash('correct', 10),
      };
      mockUsersService.findByEmail.mockResolvedValue(user);

      await expect(service.login('a@b.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('유효한 리프레시 토큰으로 새 토큰 발급', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'u1' });
      const storedToken = {
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        deleteOne: jest.fn().mockResolvedValue({}),
      };
      mockRefreshTokenModel.findOne.mockResolvedValue(storedToken);
      mockUsersService.findById.mockResolvedValue({ _id: 'u1', email: 'a@b.com' });
      mockRefreshTokenModel.create.mockResolvedValue({});

      const result = await service.refresh('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(storedToken.deleteOne).toHaveBeenCalled();
    });

    it('만료된 리프레시 토큰이면 UnauthorizedException', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'u1' });
      mockRefreshTokenModel.findOne.mockResolvedValue({
        expiresAt: new Date(Date.now() - 1000),
        deleteOne: jest.fn(),
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('저장된 토큰 없으면 UnauthorizedException', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'u1' });
      mockRefreshTokenModel.findOne.mockResolvedValue(null);

      await expect(service.refresh('no-stored-token')).rejects.toThrow(UnauthorizedException);
    });

    it('JWT verify 실패 시 UnauthorizedException', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('invalid'); });

      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
