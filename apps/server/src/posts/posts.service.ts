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

    // 같은 러닝으로 다시 보내면(재시도) 새로 만들지 않고 있던 포스트를 돌려준다
    return this.postModel
      .findOneAndUpdate({ runId: dto.runId }, { $setOnInsert: { runId: dto.runId, userId } }, { upsert: true, new: true })
      .exec();
  }

  // 내 러닝이 since 이후 받은 응원 수(러닝별). 「응원 받은 순간」: 다음에 내 지도를 열 때 그 길이 한 번 빛난다
  async receivedSince(userId: string, since: Date): Promise<{ runId: string; count: number }[]> {
    const rows = await this.postModel
      .aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { userId: new Types.ObjectId(userId), 'cheerLog.at': { $gt: since } } },
        { $unwind: '$cheerLog' },
        { $match: { 'cheerLog.at': { $gt: since } } },
        { $group: { _id: '$runId', count: { $sum: 1 } } },
      ])
      .exec();
    return rows.map((r) => ({ runId: String(r._id), count: r.count }));
  }

  // 응원 토글. 응원은 러닝 저장 때 만든 포스트의 likes에 쌓이고, 누른 시각은 cheerLog에 남는다(N1 집계). 내 러닝은 응원할 수 없다
  async cheer(userId: string, runId: string): Promise<{ cheers: number; cheered: boolean }> {
    if (!isValidObjectId(runId)) throw new NotFoundException('post_not_found');
    const post = await this.postModel.findOne({ runId: new Types.ObjectId(runId) }).select('userId likes').lean().exec();
    if (!post) throw new NotFoundException('post_not_found');
    if (String(post.userId) === userId) throw new ForbiddenException('own_run');
    const viewer = new Types.ObjectId(userId);
    const cheered = !post.likes.some((id) => viewer.equals(id));
    const updated = await this.postModel
      .findByIdAndUpdate(
        post._id,
        cheered
          ? { $addToSet: { likes: viewer }, $push: { cheerLog: { userId: viewer, at: new Date() } } }
          : { $pull: { likes: viewer, cheerLog: { userId: viewer } } },
        { new: true },
      )
      .select('likes')
      .lean()
      .exec();
    return { cheers: updated?.likes.length ?? 0, cheered };
  }
}
