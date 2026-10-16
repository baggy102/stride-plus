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
