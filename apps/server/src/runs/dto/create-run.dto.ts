import { Transform, Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { NoBannedWords } from '../../common/banned-words';

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
  @NoBannedWords()
  description?: string;
}
