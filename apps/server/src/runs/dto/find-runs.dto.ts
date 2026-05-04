import { Type } from 'class-transformer';
import { IsMongoId, IsNumber, IsOptional, Max, Min } from 'class-validator';

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
  @Min(1)
  @Max(50000)
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
}
