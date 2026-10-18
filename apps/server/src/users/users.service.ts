import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { promises as fs } from 'fs';
import { basename, join } from 'path';
import { User, UserDocument } from './users.schema';
import { Run, RunDocument } from '../runs/runs.schema';
import { Post, PostDocument } from '../posts/posts.schema';
import { RefreshToken, RefreshTokenDocument } from '../auth/auth.schema';
import type { Consents } from '../auth/legal-versions';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Run.name)
    private readonly runModel: Model<RunDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  create(email: string, passwordHash: string, username: string, consents: Consents): Promise<UserDocument> {
    return this.userModel.create({ email, passwordHash, username, consents });
  }

  // 차단은 멱등($addToSet). 형식이 틀리거나 없는 사용자는 404 — 앱은 「없는 사용자」 한 가지로 처리한다.
  async block(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) throw new BadRequestException('cannot_block_self');
    if (!isValidObjectId(targetId) || !(await this.userModel.exists({ _id: targetId }))) {
      throw new NotFoundException('user_not_found');
    }
    await this.userModel
      .updateOne({ _id: userId }, { $addToSet: { blocked: new Types.ObjectId(targetId) } })
      .exec();
  }

  async unblock(userId: string, targetId: string): Promise<void> {
    if (!isValidObjectId(targetId)) throw new NotFoundException('user_not_found');
    await this.userModel
      .updateOne({ _id: userId }, { $pull: { blocked: new Types.ObjectId(targetId) } })
      .exec();
  }

  async isBlocking(userId: string, targetId: string): Promise<boolean> {
    if (!isValidObjectId(targetId)) return false;
    return !!(await this.userModel.exists({ _id: userId, blocked: new Types.ObjectId(targetId) }));
  }

  // 트랜잭션 없이 순서로 안전하게 지운다: 사용자 문서를 맨 마지막에 지우므로
  // 중간에 실패해도 계정이 남아 있고, 다시 호출하면 이어서 지워진다(각 단계 멱등).
  async deleteAccount(userId: string): Promise<void> {
    const oid = new Types.ObjectId(userId);

    const runs = await this.runModel
      .find({ userId: oid })
      .select('_id photoUrls routeImageUrl')
      .lean()
      .exec();
    const runIds = runs.map((run) => run._id);

    await this.postModel.deleteMany({ $or: [{ userId: oid }, { runId: { $in: runIds } }] }).exec();
    await this.postModel.updateMany({ likes: oid }, { $pull: { likes: oid } }).exec();
    await this.runModel.deleteMany({ userId: oid }).exec();
    await this.userModel
      .updateMany({ $or: [{ following: oid }, { blocked: oid }] }, { $pull: { following: oid, blocked: oid } })
      .exec();
    await this.refreshTokenModel.deleteMany({ userId: oid }).exec();
    await this.userModel.deleteOne({ _id: oid }).exec();

    const uploadUrls = runs.flatMap((run) => [
      ...((run.photoUrls as string[] | undefined) ?? []),
      (run as unknown as { routeImageUrl?: string }).routeImageUrl ?? '',
    ]);
    await this.removeUploads(uploadUrls);
  }

  // '/uploads/<파일명>'의 파일명만 써서 uploads 폴더 밖을 가리키지 못하게 한다.
  // 이미 없는 파일 등 삭제 실패는 계정 삭제를 막지 않는다. F4(오브젝트 스토리지)에서 교체.
  private async removeUploads(urls: string[]) {
    const files = urls.filter((url) => url.startsWith('/uploads/')).map((url) => basename(url));
    await Promise.all(
      files.map((file) => fs.unlink(join(process.cwd(), 'uploads', file)).catch(() => undefined)),
    );
  }
}
