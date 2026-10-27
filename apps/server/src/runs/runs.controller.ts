import {
  Controller, Get, Post, Param, Query, Req,
  UseInterceptors, UploadedFiles, Body,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
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
  findRuns(@Req() req: { user: { sub: string } }, @Query() dto: FindRunsDto) {
    if (dto.userId) {
      return this.runsService.findByUser(req.user.sub, dto.userId, dto.page, dto.limit);
    }
    return this.runsService.findNearby(req.user.sub, dto.lat ?? 0, dto.lng ?? 0, dto.radius ?? 5000);
  }

  // ':id'보다 먼저 선언해야 'stats'가 러닝 ID로 잡히지 않는다
  @Get('stats/:userId')
  stats(@Req() req: { user: { sub: string } }, @Param('userId') userId: string) {
    return this.runsService.statsByUser(req.user.sub, userId);
  }

  @Get(':id')
  findById(@Req() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.runsService.findById(req.user.sub, id);
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'routeImage', maxCount: 1 }, { name: 'photos', maxCount: 3 }],
      { storage },
    ),
  )
  create(
    @Req() req: { user: { sub: string } },
    @Body() dto: CreateRunDto,
    @UploadedFiles() files: { routeImage?: Express.Multer.File[]; photos?: Express.Multer.File[] },
  ) {
    const routeImageUrl = files?.routeImage?.[0]
      ? `/uploads/${files.routeImage[0].filename}`
      : '';
    const photoUrls = (files?.photos ?? []).map((f) => `/uploads/${f.filename}`);
    return this.runsService.create(req.user.sub, dto, routeImageUrl, photoUrls);
  }
}
