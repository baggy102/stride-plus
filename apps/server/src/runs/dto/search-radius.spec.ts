import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindDensityDto } from './find-density.dto';
import { FindNewCellsDto } from './find-new-cells.dto';
import { FindRunsDto } from './find-runs.dto';
import { MAX_SEARCH_RADIUS_M, MIN_SEARCH_RADIUS_M } from './search-radius';

// 지도 검색 세 엔드포인트(마커·density·new-cells)는 같은 반경 범위를 쓴다
describe.each([
  ['FindRunsDto', FindRunsDto, {}],
  ['FindDensityDto', FindDensityDto, { cell: '50' }],
  ['FindNewCellsDto', FindNewCellsDto, {}],
])('%s radius', (_name, Dto, extra) => {
  const radiusErrors = async (radius: string) => {
    const dto = plainToInstance(Dto as new () => object, { lat: '37.5', lng: '127.0', radius, ...extra });
    return (await validate(dto)).filter((e) => e.property === 'radius');
  };

  it('하한 50m — 앱이 보내는 가장 작은 반경(약 150m)보다 작다', async () => {
    expect(MIN_SEARCH_RADIUS_M).toBe(50);
    expect(await radiusErrors('49')).toHaveLength(1);
    expect(await radiusErrors('1')).toHaveLength(1);
    expect(await radiusErrors('50')).toHaveLength(0);
    expect(await radiusErrors('150')).toHaveLength(0);
  });

  it('상한 300km', async () => {
    expect(await radiusErrors(String(MAX_SEARCH_RADIUS_M))).toHaveLength(0);
    expect(await radiusErrors(String(MAX_SEARCH_RADIUS_M + 1))).toHaveLength(1);
  });
});
