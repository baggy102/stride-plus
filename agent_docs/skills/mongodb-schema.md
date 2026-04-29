# Skill: MongoDB + Mongoose

## Purpose
Stride+의 데이터 스키마 정의와 인덱스 설정 규칙을 담는다.

## Schemas

### User
```ts
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true }) email: string;
  @Prop({ required: true }) passwordHash: string;
  @Prop({ default: '' }) bio: string;
  @Prop({ default: [] }) following: Types.ObjectId[];
}
```

### Run
```ts
@Schema({ timestamps: true })
export class Run {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) userId: Types.ObjectId;
  @Prop({ required: true, type: { type: String, coordinates: [[Number]] } }) route: GeoJSONLineString;
  @Prop({ required: true }) distanceKm: number;
  @Prop({ required: true }) paceSecPerKm: number;
  @Prop({ default: [] }) photoUrls: string[];
  @Prop({ default: '' }) description: string;
}
```

### Post
```ts
@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Run' }) runId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) userId: Types.ObjectId;
  @Prop({ default: [] }) likes: Types.ObjectId[];
}
```

## Required indexes
```ts
// Run 저장 시 반드시 설정
RunSchema.index({ route: '2dsphere' });
RunSchema.index({ userId: 1, createdAt: -1 });
```

## Rules
- `route` 필드는 반드시 GeoJSON `LineString` 타입
- `Post`는 `Run` 없이 생성 불가 — service 레이어에서 runId 존재 검증
- soft delete 없음, 물리 삭제
