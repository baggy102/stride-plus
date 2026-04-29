import { Controller, Get, Param, Query } from '@nestjs/common';
import { RunsService } from './runs.service';
import { FindRunsDto } from './dto/find-runs.dto';

@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Get()
  findNearby(@Query() dto: FindRunsDto) {
    return this.runsService.findNearby(dto.lat, dto.lng, dto.radius ?? 5000);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.runsService.findById(id);
  }
}
