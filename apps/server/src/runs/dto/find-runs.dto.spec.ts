import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindRunsDto } from './find-runs.dto';

const radiusErrors = async (radius: string) => {
  const dto = plainToInstance(FindRunsDto, { lat: '37.5', lng: '127.0', radius });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'radius');
};

describe('FindRunsDto radius', () => {
  it('지도 축소용 최대 반경 300km 허용', async () => {
    expect(await radiusErrors('300000')).toHaveLength(0);
  });

  it('300km 초과는 거부', async () => {
    expect(await radiusErrors('300001')).toHaveLength(1);
  });

  it('1m 미만은 거부', async () => {
    expect(await radiusErrors('0')).toHaveLength(1);
  });
});

describe('FindRunsDto from·to', () => {
  const periodErrors = async (from: string, to: string) => {
    const dto = plainToInstance(FindRunsDto, { userId: '507f1f77bcf86cd799439011', from, to });
    const errors = await validate(dto);
    return errors.filter((e) => e.property === 'from' || e.property === 'to');
  };

  it('ISO 8601 시각은 허용', async () => {
    expect(await periodErrors('2026-10-31T15:00:00.000Z', '2026-11-30T15:00:00+09:00')).toHaveLength(0);
  });

  it('ISO 8601이 아니면 거부', async () => {
    expect(await periodErrors('2026/11/01', 'yesterday')).toHaveLength(2);
  });
});
