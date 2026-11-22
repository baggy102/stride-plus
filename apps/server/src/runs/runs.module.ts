import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { Run, RunSchema } from './runs.schema';
import { User, UserSchema } from '../users/users.schema';
import { Post, PostSchema } from '../posts/posts.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Run.name, schema: RunSchema },
      // 차단 관계 조회(hiddenUserIds)
      { name: User.name, schema: UserSchema },
      // 응원 수(cheers) 집계
      { name: Post.name, schema: PostSchema },
    ]),
  ],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
