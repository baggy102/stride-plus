import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { promises as fs } from 'fs';
import { join } from 'path';
import { UsersService } from './users.service';
import { User } from './users.schema';
import { Run } from '../runs/runs.schema';
import { Post } from '../posts/posts.schema';
import { RefreshToken } from '../auth/auth.schema';

const execOf = (value: unknown = {}) => ({ exec: jest.fn().mockResolvedValue(value) });

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
  exists: jest.fn(),
  deleteOne: jest.fn(),
};
const mockRunModel = { find: jest.fn(), deleteMany: jest.fn(), aggregate: jest.fn() };
const mockPostModel = { deleteMany: jest.fn(), updateMany: jest.fn() };
const mockRefreshTokenModel = { deleteMany: jest.fn() };

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Run.name), useValue: mockRunModel },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        { provide: getModelToken(RefreshToken.name), useValue: mockRefreshTokenModel },
      ],
    }).compile();

    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  it('findByEmail — 이메일로 유저 조회', async () => {
    const user = { _id: 'u1', email: 'a@b.com' };
    mockUserModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });

    const result = await service.findByEmail('a@b.com');
    expect(result).toEqual(user);
    expect(mockUserModel.findOne).toHaveBeenCalledWith({ email: 'a@b.com' });
  });

  it('findByEmail — 없으면 null 반환', async () => {
    mockUserModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    const result = await service.findByEmail('notfound@b.com');
    expect(result).toBeNull();
  });

  it('findById — ID로 유저 조회', async () => {
    const user = { _id: 'u1', email: 'a@b.com' };
    mockUserModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });

    const result = await service.findById('u1');
    expect(result).toEqual(user);
  });

  it('create — 유저 생성', async () => {
    const newUser = { _id: 'u2', email: 'c@d.com', passwordHash: 'hash' };
    mockUserModel.create.mockResolvedValue(newUser);

    const consents = { terms: 'v', privacy: 'v', location: 'v', agreedAt: new Date() };
    const result = await service.create('c@d.com', 'hash', 'charlie', consents);
    expect(result).toEqual(newUser);
    expect(mockUserModel.create).toHaveBeenCalledWith({ email: 'c@d.com', passwordHash: 'hash', username: 'charlie', consents });
  });

  describe('runStats', () => {
    const USER = '64b7f0c2a1b2c3d4e5f60712';

    it('사용자 러닝 전체의 거리 합계와 횟수를 집계한다', async () => {
      mockRunModel.aggregate.mockReturnValue(execOf([{ _id: null, totalDistanceKm: 212.5, runCount: 31 }]));
      expect(await service.runStats(USER)).toEqual({ totalDistanceKm: 212.5, runCount: 31 });
      expect(mockRunModel.aggregate).toHaveBeenCalledWith([
        { $match: { userId: new Types.ObjectId(USER) } },
        { $group: { _id: null, totalDistanceKm: { $sum: '$distanceKm' }, runCount: { $sum: 1 } } },
      ]);
    });

    it('러닝이 없으면 0, 형식이 틀린 ID는 조회 없이 0', async () => {
      mockRunModel.aggregate.mockReturnValue(execOf([]));
      expect(await service.runStats(USER)).toEqual({ totalDistanceKm: 0, runCount: 0 });
      mockRunModel.aggregate.mockClear();
      expect(await service.runStats('abc')).toEqual({ totalDistanceKm: 0, runCount: 0 });
      expect(mockRunModel.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('block / unblock', () => {
    const ME = '64b7f0c2a1b2c3d4e5f60710';
    const TARGET = '64b7f0c2a1b2c3d4e5f60711';

    it('block — 대상을 $addToSet으로 추가(중복 차단은 멱등)', async () => {
      mockUserModel.exists.mockResolvedValue({ _id: TARGET });
      mockUserModel.updateOne.mockReturnValue(execOf());

      await service.block(ME, TARGET);
      await service.block(ME, TARGET);

      expect(mockUserModel.updateOne).toHaveBeenCalledTimes(2);
      expect(mockUserModel.updateOne).toHaveBeenCalledWith(
        { _id: ME },
        { $addToSet: { blocked: new Types.ObjectId(TARGET) } },
      );
    });

    it('block — 자기 자신이면 400(cannot_block_self)', async () => {
      await expect(service.block(ME, ME)).rejects.toThrow(new BadRequestException('cannot_block_self'));
      expect(mockUserModel.updateOne).not.toHaveBeenCalled();
    });

    it('block — 없는 사용자면 404', async () => {
      mockUserModel.exists.mockResolvedValue(null);
      await expect(service.block(ME, TARGET)).rejects.toThrow(new NotFoundException('user_not_found'));
      expect(mockUserModel.updateOne).not.toHaveBeenCalled();
    });

    it('block — 형식이 틀린 ID면 조회 없이 404', async () => {
      await expect(service.block(ME, 'abc')).rejects.toThrow(new NotFoundException('user_not_found'));
      expect(mockUserModel.exists).not.toHaveBeenCalled();
    });

    it('unblock — 대상을 $pull', async () => {
      mockUserModel.updateOne.mockReturnValue(execOf());
      await service.unblock(ME, TARGET);
      expect(mockUserModel.updateOne).toHaveBeenCalledWith(
        { _id: ME },
        { $pull: { blocked: new Types.ObjectId(TARGET) } },
      );
    });

    it('isBlocking — 내 blocked에 있으면 true, 형식이 틀리면 false', async () => {
      mockUserModel.exists.mockResolvedValue({ _id: ME });
      expect(await service.isBlocking(ME, TARGET)).toBe(true);
      expect(await service.isBlocking(ME, 'abc')).toBe(false);
    });
  });

  describe('deleteAccount', () => {
    const USER_ID = '64b7f0c2a1b2c3d4e5f60719';
    const oid = new Types.ObjectId(USER_ID);
    const runId = new Types.ObjectId();
    let unlinkSpy: jest.SpyInstance;
    const order: string[] = [];

    beforeEach(() => {
      order.length = 0;
      const track = (name: string, value: unknown = {}) =>
        jest.fn(() => { order.push(name); return execOf(value); });
      mockRunModel.find.mockReturnValue({
        select: () => ({ lean: () => execOf([
          { _id: runId, photoUrls: ['/uploads/a.jpg', '/uploads/../../evil.txt'], routeImageUrl: '/uploads/r.png' },
        ]) }),
      });
      mockPostModel.deleteMany.mockImplementation(track('posts.deleteMany'));
      mockPostModel.updateMany.mockImplementation(track('posts.updateMany'));
      mockRunModel.deleteMany.mockImplementation(track('runs.deleteMany'));
      mockUserModel.updateMany.mockImplementation(track('users.updateMany'));
      mockRefreshTokenModel.deleteMany.mockImplementation(track('tokens.deleteMany'));
      mockUserModel.deleteOne.mockImplementation(track('users.deleteOne'));
      unlinkSpy = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);
    });

    afterEach(() => unlinkSpy.mockRestore());

    it('연관 데이터를 각 조건으로 지우고 사용자 문서는 마지막에 지운다', async () => {
      await service.deleteAccount(USER_ID);

      expect(mockPostModel.deleteMany).toHaveBeenCalledWith({ $or: [{ userId: oid }, { runId: { $in: [runId] } }] });
      expect(mockPostModel.updateMany).toHaveBeenCalledWith({ likes: oid }, { $pull: { likes: oid } });
      expect(mockRunModel.deleteMany).toHaveBeenCalledWith({ userId: oid });
      expect(mockUserModel.updateMany).toHaveBeenCalledWith(
        { $or: [{ following: oid }, { blocked: oid }] },
        { $pull: { following: oid, blocked: oid } },
      );
      expect(mockRefreshTokenModel.deleteMany).toHaveBeenCalledWith({ userId: oid });
      expect(mockUserModel.deleteOne).toHaveBeenCalledWith({ _id: oid });
      expect(order[order.length - 1]).toBe('users.deleteOne');
    });

    it('업로드 파일은 파일명만으로 uploads 폴더 안에서 지운다', async () => {
      await service.deleteAccount(USER_ID);

      const uploads = join(process.cwd(), 'uploads');
      expect(unlinkSpy).toHaveBeenCalledWith(join(uploads, 'a.jpg'));
      expect(unlinkSpy).toHaveBeenCalledWith(join(uploads, 'r.png'));
      expect(unlinkSpy).toHaveBeenCalledWith(join(uploads, 'evil.txt'));
      for (const [path] of unlinkSpy.mock.calls) expect(String(path).startsWith(uploads)).toBe(true);
    });

    it('파일 삭제가 실패해도 예외 없이 끝난다', async () => {
      unlinkSpy.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      await expect(service.deleteAccount(USER_ID)).resolves.toBeUndefined();
    });
  });
});
