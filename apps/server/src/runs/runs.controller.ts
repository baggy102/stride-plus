import {
  Controller, Get, Post, Param, Query, Req,
  UseInterceptors, UploadedFiles, Body,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { RunsService } from './runs.service';
import { FindRunsDto } from './dto/find-runs.dto';
import { CreateRunDto } from './dto/create-run.dto';

const storage = diskStorage({
  destination: './uploads',
  filename: (_, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Get()
  findRuns(@Query() dto: FindRunsDto) {
    if (dto.userId) {
      return this.runsService.findByUser(dto.userId, dto.page, dto.limit);
    }
    return this.runsService.findNearby(dto.lat ?? 0, dto.lng ?? 0, dto.radius ?? 5000);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.runsService.findById(id);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('photos', 3, { storage }))
  create(
    @Req() req: { user: { sub: string } },
    @Body() dto: CreateRunDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const photoUrls = (files ?? []).map((f) => `/uploads/${f.filename}`);
    return this.runsService.create(req.user.sub, dto, photoUrls);
  }
}
