import {
  Controller, Get, Post, Param, Query, Req,
  UseInterceptors, UploadedFiles, Body,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RunsService } from './runs.service';
import { StorageService } from '../storage/storage.service';
import { FindRunsDto } from './dto/find-runs.dto';
import { CreateRunDto } from './dto/create-run.dto';

// 메모리로 받아 StorageService가 S3(운영) 또는 uploads 폴더(로컬)에 쓴다. 사진 한 장 10MB까지
const upload = { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } };

@Controller('runs')
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly storage: StorageService,
  ) {}

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
      upload,
    ),
  )
  async create(
    @Req() req: { user: { sub: string } },
    @Body() dto: CreateRunDto,
    @UploadedFiles() files: { routeImage?: Express.Multer.File[]; photos?: Express.Multer.File[] },
  ) {
    const routeImageUrl = files?.routeImage?.[0] ? await this.storage.save(files.routeImage[0]) : '';
    const photoUrls = await Promise.all((files?.photos ?? []).map((f) => this.storage.save(f)));
    return this.runsService.create(req.user.sub, dto, routeImageUrl, photoUrls);
  }
}
