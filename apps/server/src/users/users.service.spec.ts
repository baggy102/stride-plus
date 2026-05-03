import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { UsersService } from './users.service';
import { User } from './users.schema';

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
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

    const result = await service.create('c@d.com', 'hash', 'charlie');
    expect(result).toEqual(newUser);
    expect(mockUserModel.create).toHaveBeenCalledWith({ email: 'c@d.com', passwordHash: 'hash', username: 'charlie' });
  });
});
