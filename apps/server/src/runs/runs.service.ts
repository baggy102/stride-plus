import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { Run, RunDocument } from './runs.schema';
import { User, UserDocument } from '../users/users.schema';
import { Post, PostDocument } from '../posts/posts.schema';
import { CreateRunDto } from './dto/create-run.dto';
import { trimHomeEnds } from './home-privacy';
import { densityCells, type DensityCell } from './density';
import { newCells, NEW_LOOKBACK_MS, NEW_WINDOW_MS, type NewCellsResult } from './new-cells';

const MARKER_SELECT = 'userId distanceKm paceSecPerKm routeImageUrl photoUrls description createdAt route';
const USER_SELECT = '_id username profileImageUrl role';
const DEFAULT_RADIUS = 5000;
// 지도를 넓게 축소했을 때 응답 크기 상한. $near라 가까운 순으로 자른다.
const MAX_NEARBY_RESULTS = 500;
// D3 바탕은 이번 주(최근 7일) 러닝만 센다
const DENSITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RunsService {
  constructor(
    @InjectModel(Run.name)
    private readonly runModel: Model<RunDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
  ) {}

  // 러닝별 응원 수와 내가 응원했는지. 포스트가 없는 러닝은 0
  private async cheersByRun(viewerId: string, runIds: unknown[]): Promise<Map<string, { cheers: number; cheered: boolean }>> {
    if (runIds.length === 0) return new Map();
    const rows = await this.postModel
      .aggregate<{ runId: Types.ObjectId; cheers: number; cheered: boolean }>([
        { $match: { runId: { $in: runIds } } },
        { $project: { runId: 1, cheers: { $size: '$likes' }, cheered: { $in: [new Types.ObjectId(viewerId), '$likes'] } } },
      ])
      .exec();
    return new Map(rows.map((row) => [String(row.runId), { cheers: row.cheers, cheered: row.cheered }]));
  }

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
    const cheers = await this.cheersByRun(viewerId, runs.map((run) => run._id));

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
        description: (run as unknown as { description?: string }).description ?? '',
        startPoint: visibleRoute(viewerId, run.userId, route?.coordinates ?? [])[0] ?? null,
        cheers: cheers.get(String(run._id))?.cheers ?? 0,
        cheered: cheers.get(String(run._id))?.cheered ?? false,
        createdAt,
      };
    });
  }

  // 지도 피드 D3 바탕: 최근 7일 러닝이 지난 칸마다 서로 다른 러너 수(3명 이상만). 남의 경로는 집 근처를 잘라 센다
  async density(viewerId: string, lat: number, lng: number, radius: number, cellMeters: number): Promise<DensityCell[]> {
    const hidden = await this.hiddenUserIds(viewerId);
    const runs = await this.runModel
      .find({
        userId: { $nin: hidden },
        createdAt: { $gte: new Date(Date.now() - DENSITY_WINDOW_MS) },
        route: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radius } },
      })
      .select('userId route')
      .limit(MAX_NEARBY_RESULTS)
      .lean()
      .exec();
    return densityCells(
      runs.map((run) => {
        const route = (run.route as { coordinates: [number, number][] } | undefined)?.coordinates ?? [];
        return { userId: String(run.userId), route: visibleRoute(viewerId, run.userId, route) };
      }),
      cellMeters,
      lat,
    );
  }

  // 지도 피드 NEW: 「이번 주 새 길」 칸(최근 7일 통과 중 직전 28일 아무도 안 지난 칸)과 그 칸을 연 러닝.
  // 내 러닝까지 모두 출발·도착 100m를 잘라 센다 — 잘린 구간이 민트 점으로 다시 드러나지 않게(R10, 법적 확인 범위)
  async newCells(viewerId: string, lat: number, lng: number, radius: number): Promise<NewCellsResult> {
    const hidden = await this.hiddenUserIds(viewerId);
    const now = Date.now();
    const runs = await this.runModel
      .find({
        userId: { $nin: hidden },
        createdAt: { $gte: new Date(now - NEW_WINDOW_MS - NEW_LOOKBACK_MS) },
        route: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radius } },
      })
      .select('route createdAt')
      .limit(MAX_NEARBY_RESULTS)
      .lean()
      .exec();
    return newCells(
      runs.map((run) => ({
        id: String(run._id),
        at: new Date((run as { createdAt?: Date }).createdAt ?? 0).getTime(),
        route: trimHomeEnds((run.route as { coordinates: [number, number][] } | undefined)?.coordinates ?? []).coordinates,
      })),
      now,
    );
  }

  // from·to를 주면 그 기간만: createdAt >= from, < to(to 미포함)
  async findByUser(viewerId: string, userId: string, page = 1, limit = 50, from?: Date, to?: Date) {
    const oid = new Types.ObjectId(userId);
    const hidden = await this.hiddenUserIds(viewerId);
    if (hidden.some((id) => id.equals(oid))) return [];
    const createdAt: { $gte?: Date; $lt?: Date } = {};
    if (from) createdAt.$gte = from;
    if (to) createdAt.$lt = to;
    const runs = await this.runModel
      .find(from || to ? { userId: oid, createdAt } : { userId: oid })
      .select(MARKER_SELECT)
      .populate('userId', USER_SELECT)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();
    const cheers = await this.cheersByRun(viewerId, runs.map((run) => run._id));

    return runs.map((run) => {
      const route = run.route as { type: string; coordinates: [number, number][] } | undefined;
      const coordinates = visibleRoute(viewerId, run.userId, route?.coordinates ?? []);
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
        description: (run as unknown as { description?: string }).description ?? '',
        startPoint: coordinates[0] ?? null,
        route: coordinates,
        cheers: cheers.get(String(run._id))?.cheers ?? 0,
        cheered: cheers.get(String(run._id))?.cheered ?? false,
        createdAt,
      };
    });
  }

  // 프로필 누적(TOTAL)과 「내 n번째 러닝」. 차단 관계면 목록처럼 비어 있는 값(D3)
  async statsByUser(viewerId: string, userId: string): Promise<{ totalKm: number; runCount: number }> {
    if (!isValidObjectId(userId)) throw new NotFoundException('user_not_found');
    const oid = new Types.ObjectId(userId);
    const hidden = await this.hiddenUserIds(viewerId);
    if (hidden.some((id) => id.equals(oid))) return { totalKm: 0, runCount: 0 };
    const [row] = await this.runModel
      .aggregate<{ totalKm: number; runCount: number }>([
        { $match: { userId: oid } },
        { $group: { _id: null, totalKm: { $sum: '$distanceKm' }, runCount: { $sum: 1 } } },
      ])
      .exec();
    return { totalKm: row?.totalKm ?? 0, runCount: row?.runCount ?? 0 };
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
    if (!ownerId || ownerId.equals(viewerId) || !run.route) return run;
    const trimmed = trimHomeEnds(run.route.coordinates, run.routeTimes ?? []);
    return { ...run, route: { ...run.route, coordinates: trimmed.coordinates }, routeTimes: trimmed.times };
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
      routeTimes: normalizeRouteTimes(dto.routeTimes, dto.coordinates.length),
      distanceKm: dto.distanceKm,
      paceSecPerKm: dto.paceSecPerKm,
      routeImageUrl,
      photoUrls,
      description: dto.description ?? '',
    });
    return run.save();
  }
}

// 남의 러닝이면 집 근처(출발·도착 100m)를 잘라 보여준다. owner는 populate된 사용자 또는 ObjectId
function visibleRoute(viewerId: string, owner: unknown, coordinates: [number, number][]): [number, number][] {
  const ownerId = (owner as { _id?: Types.ObjectId } | null)?._id ?? owner;
  return String(ownerId) === viewerId ? coordinates : trimHomeEnds(coordinates).coordinates;
}

// 점마다의 시간은 좌표와 길이가 같고, 0 이상이며 줄어들지 않을 때만 저장한다. 아니면 빈 배열(스플릿 없음)
export function normalizeRouteTimes(times: number[] | undefined, coordinateCount: number): number[] {
  if (!Array.isArray(times) || times.length !== coordinateCount) return [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return [];
    if (i > 0 && t < times[i - 1]) return [];
  }
  return times;
}
