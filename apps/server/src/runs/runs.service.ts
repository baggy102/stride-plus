import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Run, RunDocument } from './runs.schema';
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
  ) {}

  async findNearby(lat: number, lng: number, radius = DEFAULT_RADIUS) {
    const runs = await this.runModel
      .find({
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

  async findByUser(userId: string, page = 1, limit = 50) {
    const oid = new Types.ObjectId(userId);
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

  findById(id: string) {
    return this.runModel
      .findById(id)
      .populate('userId', USER_SELECT)
      .lean()
      .exec();
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
