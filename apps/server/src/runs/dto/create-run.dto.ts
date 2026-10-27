import { Transform, Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { NoBannedWords } from '../../common/banned-words';

// multipart로 오는 JSON 문자열을 배열로. 깨진 JSON은 그대로 넘겨 검증이 400으로 거절하게 한다
function parseJsonField(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export class CreateRunDto {
  @Transform(({ value }) => parseJsonField(value))
  @IsArray()
  coordinates: [number, number][];

  // 경로 점마다 시작 후 흐른 시간(초). 없으면 스플릿 없이 저장한다
  @IsOptional()
  @Transform(({ value }) => parseJsonField(value))
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
