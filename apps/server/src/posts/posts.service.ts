import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post, PostDocument } from './posts.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { Run, RunDocument } from '../runs/runs.schema';

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Run.name)
    private readonly runModel: Model<RunDocument>,
  ) {}

  async create(userId: string, dto: CreatePostDto) {
    const run = await this.runModel.findById(dto.runId).lean().exec();
    if (!run) throw new NotFoundException('run_not_found');

    const post = new this.postModel({ runId: dto.runId, userId });
    return post.save();
  }
}
