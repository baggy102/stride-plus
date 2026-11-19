import { Controller, Post, Body, Param, Req } from '@nestjs/common';
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

  @Post('run/:runId/cheer')
  cheer(@Req() req: { user: { sub: string } }, @Param('runId') runId: string) {
    return this.postsService.cheer(req.user.sub, runId);
  }
}
