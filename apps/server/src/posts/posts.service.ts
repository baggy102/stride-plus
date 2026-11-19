import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
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
    if (String(run.userId) !== userId) throw new ForbiddenException('not_run_owner');

    const post = new this.postModel({ runId: dto.runId, userId });
    return post.save();
  }

  // 응원 토글. 응원은 러닝 저장 때 만든 포스트의 likes에 쌓인다. 내 러닝은 응원할 수 없다
  async cheer(userId: string, runId: string): Promise<{ cheers: number; cheered: boolean }> {
    if (!isValidObjectId(runId)) throw new NotFoundException('post_not_found');
    const post = await this.postModel.findOne({ runId: new Types.ObjectId(runId) }).select('userId likes').lean().exec();
    if (!post) throw new NotFoundException('post_not_found');
    if (String(post.userId) === userId) throw new ForbiddenException('own_run');
    const viewer = new Types.ObjectId(userId);
    const cheered = !post.likes.some((id) => viewer.equals(id));
    const updated = await this.postModel
      .findByIdAndUpdate(post._id, cheered ? { $addToSet: { likes: viewer } } : { $pull: { likes: viewer } }, { new: true })
      .select('likes')
      .lean()
      .exec();
    return { cheers: updated?.likes.length ?? 0, cheered };
  }
}
