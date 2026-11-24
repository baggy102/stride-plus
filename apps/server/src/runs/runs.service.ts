import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, isValidObjectId } from 'mongoose';
import { Run, RunDocument } from './runs.schema';
import { User, UserDocument } from '../users/users.schema';
import { Post, PostDocument } from '../posts/posts.schema';
import { CreateRunDto } from './dto/create-run.dto';
import { distanceToRouteMeters, routeWithinMeters, trimHomeEnds } from './home-privacy';
import { startPublic, startPublicUpdate, type GeoPoint } from './start-point';
import { densityCells, type DensityCell } from './density';
import { newCells, NEW_LOOKBACK_MS, NEW_WINDOW_MS, type NewCellsResult } from './new-cells';

type LngLat = [number, number];

// 지도 피드 마커: 경로(route)는 읽지 않는다
const MARKER_SELECT = 'userId distanceKm paceSecPerKm routeImageUrl photoUrls description createdAt startPublic';
// 본인 마커의 원래 시작점: 경로의 첫 점 하나만. userId를 함께 넣어 포함 투영으로 만든다($slice만 두면 나머지 필드를 모두 돌려준다)
const OWN_START_SELECT = { userId: 1, 'route.coordinates': { $slice: 1 } };
// 프로필 목록(경로를 같이 내려 준다)과 백필 전 문서의 마커(시작점을 경로로 계산한다)
const LIST_SELECT = 'userId distanceKm paceSecPerKm routeImageUrl photoUrls description createdAt route';
const USER_SELECT = '_id username profileImageUrl role';
const DEFAULT_RADIUS = 5000;
// 지도를 넓게 축소했을 때 응답 크기 상한. $near라 가까운 순으로 자른다.
const MAX_NEARBY_RESULTS = 500;
// D3 바탕은 이번 주(최근 7일) 러닝만 센다
const DENSITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// 백필 전 문서가 남아 있으면 이 간격으로 다시 확인한다
const LEGACY_RECHECK_MS = 5 * 60 * 1000;

const near = (lng: number, lat: number, radius: number) => ({
  $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radius },
});

@Injectable()
export class RunsService implements OnModuleInit {
  // 백필 전 문서(startPublic 없음)가 남았는지. undefined면 아직 모른다. false로 확인되면 이 프로세스에서는 다시 보지 않는다
  private legacyStartsRemain: boolean | undefined;
  private legacyCheck: Promise<void> | undefined;
  private legacyCheckedAt = 0;

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

  onModuleInit() {
    // 첫 지도 요청이 확인을 기다리지 않게 서버가 뜰 때 미리 본다
    void this.checkLegacyStarts();
  }

  private checkLegacyStarts(): Promise<void> {
    if (!this.legacyCheck) {
      this.legacyCheckedAt = Date.now();
      this.legacyCheck = Promise.resolve()
        .then(() => this.runModel.exists({ startPublic: { $exists: false } }).exec())
        .then(
          (found) => { this.legacyStartsRemain = Boolean(found); },
          // 확인하지 못하면 남아 있다고 본다(마커가 빠지는 것보다 한 번 더 찾는 편이 낫다)
          () => { this.legacyStartsRemain ??= true; },
        )
        .finally(() => { this.legacyCheck = undefined; });
    }
    return this.legacyCheck;
  }

  private async legacyStartsMayRemain(): Promise<boolean> {
    if (this.legacyStartsRemain === undefined) await this.checkLegacyStarts();
    else if (this.legacyStartsRemain && Date.now() - this.legacyCheckedAt >= LEGACY_RECHECK_MS) void this.checkLegacyStarts();
    return this.legacyStartsRemain !== false;
  }

  // 백필 전 문서(startPublic 없음)는 startPublic 검색에 잡히지 않는다. 남아 있는 동안만 원래 경로로 후보를 찾아
  // 시작점을 계산하고, 가린 시작점이 반경 안인 것만 돌려준다 — 결과가 원래 경로에 따라 달라지지 않는다.
  // 계산한 값은 문서에 채워 둔다. 백필이 끝나면 확인 한 번으로 꺼진다(routePublic 단계에서 지운다)
  private async legacyMarkers(hidden: Types.ObjectId[], lat: number, lng: number, radius: number) {
    if (!(await this.legacyStartsMayRemain())) return [];
    const runs = await this.runModel
      .find({ userId: { $nin: hidden }, startPublic: { $exists: false }, route: near(lng, lat, radius) })
      .select(LIST_SELECT)
      .populate('userId', USER_SELECT)
      .limit(MAX_NEARBY_RESULTS)
      .lean()
      .exec();
    this.fillStartPublic(runs);
    return runs
      .map(({ route, ...run }) => ({ ...run, startPublic: startPublic(routeCoordinates(route)) }))
      .filter((run) => run.startPublic && routeWithinMeters([lng, lat], [run.startPublic.coordinates], radius));
  }

  // 읽으며 계산한 시작점을 문서에 채운다. 기다리지 않고, 실패는 무시한다(다음 읽기나 백필이 다시 채운다)
  private fillStartPublic(runs: { _id: unknown; route?: unknown }[]): void {
    if (runs.length === 0) return;
    const ops = runs.map((run) => startPublicUpdate(run._id, routeCoordinates(run.route)));
    Promise.resolve()
      .then(() => this.runModel.bulkWrite(ops as Parameters<Model<RunDocument>['bulkWrite']>[0], { ordered: false }))
      .catch(() => undefined);
  }

  // 내 러닝 마커의 원래 시작점(경로의 첫 점). 저장하지 않고 결과에 든 내 러닝만 따로 읽는다
  private async ownRawStarts(viewerId: string, runIds: unknown[]): Promise<Map<string, LngLat>> {
    if (runIds.length === 0) return new Map();
    const rows = await this.runModel
      .find({ _id: { $in: runIds }, userId: new Types.ObjectId(viewerId) })
      .select(OWN_START_SELECT)
      .lean()
      .exec();
    const starts = new Map<string, LngLat>();
    for (const row of rows) {
      const first = routeCoordinates(row.route)[0];
      if (first) starts.set(String(row._id), [first[0], first[1]]);
    }
    return starts;
  }

  async findNearby(viewerId: string, lat: number, lng: number, radius = DEFAULT_RADIUS) {
    const hidden = await this.hiddenUserIds(viewerId);
    const [found, legacy] = await Promise.all([
      this.runModel
        .find({ userId: { $nin: hidden }, startPublic: near(lng, lat, radius) })
        .select(MARKER_SELECT)
        .populate('userId', USER_SELECT)
        .limit(MAX_NEARBY_RESULTS)
        .lean()
        .exec(),
      this.legacyMarkers(hidden, lat, lng, radius),
    ]);
    // 옛 문서가 섞였을 때만 시작점 거리로 다시 줄 세운다($near와 같은 가까운 순). 두 질의 사이에 채워진 문서는 한 번만
    const foundIds = new Set(found.map((run) => String(run._id)));
    const runs =
      legacy.length === 0
        ? found
        : [...found, ...legacy.filter((run) => !foundIds.has(String(run._id)))]
            .map((run) => ({ run, d: distanceToRouteMeters([lng, lat], run.startPublic ? [run.startPublic.coordinates] : []) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, MAX_NEARBY_RESULTS)
            .map(({ run }) => run);
    const [cheers, rawStarts] = await Promise.all([
      this.cheersByRun(viewerId, runs.map((run) => run._id)),
      this.ownRawStarts(viewerId, runs.filter((run) => isOwner(viewerId, run.userId)).map((run) => run._id)),
    ]);

    return runs.map((run) => {
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
        startPoint: markerStart(viewerId, run, rawStarts),
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
        route: near(lng, lat, radius),
      })
      .select('userId route')
      .limit(MAX_NEARBY_RESULTS)
      .lean()
      .exec();
    return densityCells(
      runs
        .map((run) => ({ userId: String(run.userId), route: visibleRoute(viewerId, run.userId, routeCoordinates(run.route)) }))
        // 후보는 원래 경로로 찾았다. 실제로 세는 경로(남의 것은 집 근처를 자른 것)가 반경 안을 지나는 러닝만 센다 —
        // 작은 반경으로 여러 번 물어 가린 구간이 지나는 자리를 알아내지 못하게(검색 기하를 바꾸는 routePublic 단계 전까지)
        .filter(({ route }) => routeWithinMeters([lng, lat], route, radius)),
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
        route: near(lng, lat, radius),
      })
      .select('route createdAt')
      .limit(MAX_NEARBY_RESULTS)
      .lean()
      .exec();
    return newCells(
      runs
        .map((run) => ({
          id: String(run._id),
          at: new Date((run as { createdAt?: Date }).createdAt ?? 0).getTime(),
          route: trimHomeEnds(routeCoordinates(run.route)).coordinates,
        }))
        // density와 같은 이유로, 자른 경로가 반경 안을 지나는 러닝만 센다
        .filter(({ route }) => routeWithinMeters([lng, lat], route, radius)),
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
      .select(LIST_SELECT)
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
    // 응원 수와 내가 응원했는지 — 지도 피드 마커와 같은 집계(포스트가 없으면 0·false)
    const cheer = (await this.cheersByRun(viewerId, [run._id])).get(String(run._id));
    if (!ownerId || ownerId.equals(viewerId) || !run.route) return withCheers(run, cheer);
    const trimmed = trimHomeEnds(run.route.coordinates, run.routeTimes ?? []);
    return withCheers({ ...run, route: { ...run.route, coordinates: trimmed.coordinates }, routeTimes: trimmed.times }, cheer);
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
      // 남에게 보이는 마커 시작점(집 근처를 자른 경로의 첫 점)
      startPublic: startPublic(dto.coordinates),
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

// owner는 populate된 사용자 또는 ObjectId
function isOwner(viewerId: string, owner: unknown): boolean {
  return String((owner as { _id?: Types.ObjectId } | null)?._id ?? owner) === viewerId;
}

const routeCoordinates = (route: unknown): LngLat[] => (route as { coordinates?: LngLat[] } | undefined)?.coordinates ?? [];

// 남의 러닝이면 집 근처(출발·도착 100m)를 잘라 보여준다
function visibleRoute(viewerId: string, owner: unknown, coordinates: LngLat[]): LngLat[] {
  return isOwner(viewerId, owner) ? coordinates : trimHomeEnds(coordinates).coordinates;
}

// 마커 위치: 남의 러닝은 가린 시작점, 내 러닝은 원래 시작점(지금 화면과 같다. 내 마커도 가릴지는 아직 정하지 않았다)
function markerStart(
  viewerId: string,
  run: { _id: unknown; userId: unknown; startPublic?: GeoPoint | null },
  rawStarts: Map<string, LngLat>,
): LngLat | null {
  const raw = isOwner(viewerId, run.userId) ? rawStarts.get(String(run._id)) : undefined;
  const point = raw ?? run.startPublic?.coordinates;
  return point ? [point[0], point[1]] : null;
}

// 상세 응답에 응원 수·응원 여부를 붙인다. 반환 타입을 교차 타입으로 적어 둬야 lean 문서 타입이 두 번 펼쳐지지 않는다(TS7056)
function withCheers<T extends object>(run: T, cheer?: { cheers: number; cheered: boolean }): T & { cheers: number; cheered: boolean } {
  return { ...run, cheers: cheer?.cheers ?? 0, cheered: cheer?.cheered ?? false };
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
