import { BadRequestException, Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  create(
    @Req() req: { user: { sub: string } },
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.create(req.user.sub, dto);
  }

  // 내 러닝이 since(ISO 시각) 이후 받은 응원 — 「응원 받은 순간」
  @Get('cheers/received')
  received(@Req() req: { user: { sub: string } }, @Query('since') since: string) {
    const at = new Date(since);
    if (!since || isNaN(at.getTime())) throw new BadRequestException('invalid_since');
    return this.postsService.receivedSince(req.user.sub, at);
  }

  @Post('run/:runId/cheer')
  cheer(@Req() req: { user: { sub: string } }, @Param('runId') runId: string) {
    return this.postsService.cheer(req.user.sub, runId);
  }
}
