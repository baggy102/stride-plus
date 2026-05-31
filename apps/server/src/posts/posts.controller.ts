import { Controller, Post, Body, Req } from '@nestjs/common';
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
}
