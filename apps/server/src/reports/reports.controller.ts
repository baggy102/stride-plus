import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @HttpCode(204)
  create(@Req() req: { user: { sub: string } }, @Body() dto: CreateReportDto) {
    return this.reportsService.create(req.user.sub, dto);
  }
}
