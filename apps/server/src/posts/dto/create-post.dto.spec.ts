import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostDto } from './create-post.dto';

const runIdErrors = async (body: object) => {
  const errors = await validate(plainToInstance(CreatePostDto, body));
  return errors.filter((e) => e.property === 'runId');
};

describe('CreatePostDto runId', () => {
  it('유효한 ObjectId 통과', async () => {
    expect(await runIdErrors({ runId: '64b7f0c2a1b2c3d4e5f60718' })).toHaveLength(0);
  });

  it('ObjectId 형식이 아니면 거부', async () => {
    expect(await runIdErrors({ runId: 'not-an-id' })).toHaveLength(1);
  });

  it('없으면 거부', async () => {
    expect(await runIdErrors({})).toHaveLength(1);
  });
});
