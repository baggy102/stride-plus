import { Type } from 'class-transformer';
import { IsISO8601, IsMongoId, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { MAX_SEARCH_RADIUS_M, MIN_SEARCH_RADIUS_M } from './search-radius';

export class FindRunsDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(MIN_SEARCH_RADIUS_M)
  @Max(MAX_SEARCH_RADIUS_M)
  @Type(() => Number)
  radius?: number;

  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number;

  // 기간 조회(userId 목록에만 적용). createdAt >= from, < to. 달 경계는 앱이 기기 시간대로 계산해 보낸다
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
