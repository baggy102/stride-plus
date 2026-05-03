import { Transform, Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRunDto {
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  @IsArray()
  coordinates: [number, number][];

  @Type(() => Number)
  @IsNumber()
  distanceKm: number;

  @Type(() => Number)
  @IsNumber()
  paceSecPerKm: number;

  @IsOptional()
  @IsString()
  description?: string;
}
