import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { Run, RunSchema } from './runs.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Run.name, schema: RunSchema }]),
  ],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
