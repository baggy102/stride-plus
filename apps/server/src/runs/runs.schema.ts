import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import type { GeoPoint } from './start-point';

export type RunDocument = Run & Document;

// GeoJSON 점(마커 시작점). null이면 하위 필드 검사를 하지 않는다
const PointSchema = new MongooseSchema(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

@Schema({ timestamps: true })
export class Run {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop(
    raw({
      type: { type: String, enum: ['LineString'] },
      coordinates: { type: [[Number]] },
    }),
  )
  route: { type: string; coordinates: [number, number][] };

  // 남에게 보이는 마커 시작점: 집 근처를 자른 경로의 첫 점(start-point.ts). 빈 경로면 null이라 마커로 잡히지 않는다.
  // 지도 피드 마커 검색($near)이 이 필드를 쓴다. 이 기능 전에 저장한 러닝은 값이 없다(읽을 때 채우거나 백필).
  // 원래 시작점은 저장하지 않는다 — 본인 마커는 경로의 첫 점을 그때 읽는다
  @Prop({ type: PointSchema })
  startPublic?: GeoPoint | null;

  // 경로 점마다 시작 후 흐른 시간(초, 일시정지 제외). route.coordinates와 길이가 같다. km 스플릿용(D2)
  @Prop({ type: [Number], default: [] })
  routeTimes: number[];

  @Prop({ required: true })
  distanceKm: number;

  @Prop({ required: true })
  paceSecPerKm: number;

  @Prop({ default: '' })
  routeImageUrl: string;

  @Prop({ type: [String], default: [] })
  photoUrls: string[];

  @Prop({ default: '' })
  description: string;
}

export const RunSchema = SchemaFactory.createForClass(Run);
RunSchema.index({ route: '2dsphere' });
RunSchema.index({ userId: 1, createdAt: -1 });
// 마커 $near. 마커는 기간 조건이 없어 createdAt은 붙이지 않는다. null·없는 문서는 색인되지 않는다
RunSchema.index({ startPublic: '2dsphere' });
