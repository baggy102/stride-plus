import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { Run, RunSchema } from './runs.schema';
import { User, UserSchema } from '../users/users.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Run.name, schema: RunSchema },
      // 차단 관계 조회(hiddenUserIds)
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
