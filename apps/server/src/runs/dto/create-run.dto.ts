import { Transform, Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { NoBannedWords } from '../../common/banned-words';

export class CreateRunDto {
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  @IsArray()
  coordinates: [number, number][];

  // 경로 점마다 시작 후 흐른 시간(초). 없으면 스플릿 없이 저장한다
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  @IsArray()
  @IsNumber({}, { each: true })
  routeTimes?: number[];

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
