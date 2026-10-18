import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { Run, RunDocument } from './runs.schema';
import { User, UserDocument } from '../users/users.schema';
import { CreateRunDto } from './dto/create-run.dto';

const MARKER_SELECT = 'userId distanceKm paceSecPerKm routeImageUrl photoUrls createdAt route';
const USER_SELECT = '_id username profileImageUrl';
const DEFAULT_RADIUS = 5000;
// 지도를 넓게 축소했을 때 응답 크기 상한. $near라 가까운 순으로 자른다.
const MAX_NEARBY_RESULTS = 500;

@Injectable()
export class RunsService {
  constructor(
    @InjectModel(Run.name)
    private readonly runModel: Model<RunDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // 차단은 양방향: 내가 차단한 사용자 + 나를 차단한 사용자의 러닝을 보이지 않게 한다.
  private async hiddenUserIds(viewerId: string): Promise<Types.ObjectId[]> {
    const viewer = new Types.ObjectId(viewerId);
    const [me, blockers] = await Promise.all([
      this.userModel.findById(viewer).select('blocked').lean().exec(),
      this.userModel.find({ blocked: viewer }).select('_id').lean().exec(),
    ]);
    return [...((me?.blocked as Types.ObjectId[] | undefined) ?? []), ...blockers.map((user) => user._id as Types.ObjectId)];
  }

  async findNearby(viewerId: string, lat: number, lng: number, radius = DEFAULT_RADIUS) {
    const hidden = await this.hiddenUserIds(viewerId);
    const runs = await this.runModel
      .find({
        userId: { $nin: hidden },
        route: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: radius,
          },
        },
      })
      .select(MARKER_SELECT)
      .populate('userId', USER_SELECT)
      .limit(MAX_NEARBY_RESULTS)
      .lean()
      .exec();

    return runs.map((run) => {
      const route = run.route as { type: string; coordinates: [number, number][] } | undefined;
      const photoUrls = run.photoUrls as string[] | undefined;
      const createdAt = (run as unknown as { createdAt?: Date }).createdAt;
      return {
        _id: run._id,
        userId: run.userId,
        distanceKm: run.distanceKm,
        paceSecPerKm: run.paceSecPerKm,
        routeImageUrl: (run as unknown as { routeImageUrl?: string }).routeImageUrl ?? null,
        thumbnailUrl: photoUrls?.[0] ?? null,
        photoUrls: photoUrls ?? [],
        startPoint: route?.coordinates?.[0] ?? null,
        createdAt,
      };
    });
  }

  async findByUser(viewerId: string, userId: string, page = 1, limit = 50) {
    const oid = new Types.ObjectId(userId);
    const hidden = await this.hiddenUserIds(viewerId);
    if (hidden.some((id) => id.equals(oid))) return [];
    const runs = await this.runModel
      .find({ userId: oid })
      .select(MARKER_SELECT)
      .populate('userId', USER_SELECT)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();

    return runs.map((run) => {
      const route = run.route as { type: string; coordinates: [number, number][] } | undefined;
      const photoUrls = run.photoUrls as string[] | undefined;
      const createdAt = (run as unknown as { createdAt?: Date }).createdAt;
      return {
        _id: run._id,
        userId: run.userId,
        distanceKm: run.distanceKm,
        paceSecPerKm: run.paceSecPerKm,
        routeImageUrl: (run as unknown as { routeImageUrl?: string }).routeImageUrl ?? null,
        thumbnailUrl: photoUrls?.[0] ?? null,
        photoUrls: photoUrls ?? [],
        startPoint: route?.coordinates?.[0] ?? null,
        route: route?.coordinates ?? [],
        createdAt,
      };
    });
  }

  // 형식이 틀린 ID도 404로 — 앱은 「없는 러닝」 한 가지로 처리한다.
  async findById(viewerId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('run_not_found');
    const run = await this.runModel
      .findById(id)
      .populate('userId', USER_SELECT)
      .lean()
      .exec();
    if (!run) throw new NotFoundException('run_not_found');
    // 차단 관계의 러닝도 「없는 러닝」으로 — populate 결과의 _id로 비교한다
    const ownerId = (run.userId as unknown as { _id?: Types.ObjectId } | null)?._id;
    const hidden = await this.hiddenUserIds(viewerId);
    if (ownerId && hidden.some((id) => id.equals(ownerId))) throw new NotFoundException('run_not_found');
    return run;
  }

  async create(
    userId: string,
    dto: CreateRunDto,
    routeImageUrl = '',
    photoUrls: string[] = [],
  ) {
    const run = new this.runModel({
      userId: new Types.ObjectId(userId),
      route: { type: 'LineString', coordinates: dto.coordinates },
      distanceKm: dto.distanceKm,
      paceSecPerKm: dto.paceSecPerKm,
      routeImageUrl,
      photoUrls,
      description: dto.description ?? '',
    });
    return run.save();
  }
}
