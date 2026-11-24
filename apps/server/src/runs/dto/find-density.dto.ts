import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { MAX_SEARCH_RADIUS_M, MIN_SEARCH_RADIUS_M } from './search-radius';

// GET /runs/density — 지도 피드 D3 바탕. cell은 화면 11px에 해당하는 미터(앱이 줌으로 계산)
export class FindDensityDto {
  @IsNumber()
  @Type(() => Number)
  lat: number;

  @IsNumber()
  @Type(() => Number)
  lng: number;

  @IsNumber()
  @Min(MIN_SEARCH_RADIUS_M)
  @Max(MAX_SEARCH_RADIUS_M)
  @Type(() => Number)
  radius: number;

  @IsNumber()
  @Min(5)
  @Max(5000)
  @Type(() => Number)
  cell: number;
}
