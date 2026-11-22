import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

// GET /runs/new-cells — 지도 피드 NEW(이번 주 새 길). 칸은 서버의 고정 지리 칸이라 크기를 받지 않는다
export class FindNewCellsDto {
  @IsNumber()
  @Type(() => Number)
  lat: number;

  @IsNumber()
  @Type(() => Number)
  lng: number;

  @IsNumber()
  @Min(1)
  @Max(300000)
  @Type(() => Number)
  radius: number;
}
