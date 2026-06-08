import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RunDocument = Run & Document;

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
