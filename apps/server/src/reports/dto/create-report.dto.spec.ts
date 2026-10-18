import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReportDto } from './create-report.dto';

const errorsOf = async (body: object) =>
  (await validate(plainToInstance(CreateReportDto, body))).map((e) => e.property);

const VALID = { targetType: 'run', targetId: '64b7f0c2a1b2c3d4e5f60718', reason: 'spam' };

describe('CreateReportDto', () => {
  it('유효한 신고 통과', async () => {
    expect(await errorsOf(VALID)).toEqual([]);
  });

  it('정해지지 않은 대상 유형·사유는 거부', async () => {
    expect(await errorsOf({ ...VALID, targetType: 'post' })).toEqual(['targetType']);
    expect(await errorsOf({ ...VALID, reason: 'boring' })).toEqual(['reason']);
  });

  it('대상 ID가 ObjectId가 아니거나 없으면 거부', async () => {
    expect(await errorsOf({ ...VALID, targetId: 'abc' })).toEqual(['targetId']);
    expect(await errorsOf({ targetType: 'user', reason: 'other' })).toEqual(['targetId']);
  });
});
