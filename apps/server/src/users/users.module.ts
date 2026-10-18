import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User, UserSchema } from './users.schema';
import { Run, RunSchema } from '../runs/runs.schema';
import { Post, PostSchema } from '../posts/posts.schema';
import { RefreshToken, RefreshTokenSchema } from '../auth/auth.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      // 계정 삭제(deleteAccount)에서 연관 데이터를 함께 지우기 위해 등록
      { name: Run.name, schema: RunSchema },
      { name: Post.name, schema: PostSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
