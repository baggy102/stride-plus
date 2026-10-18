import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const REPORT_TARGET_TYPES = ['run', 'user'] as const;
export const REPORT_REASONS = ['spam', 'inappropriate', 'harassment', 'other'] as const;

export type ReportDocument = Report & Document;

// 신고 접수 기록. 검토·조치는 운영에서 한다(코드 범위 밖).
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Report {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  reporterId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: REPORT_TARGET_TYPES })
  targetType: (typeof REPORT_TARGET_TYPES)[number];

  @Prop({ required: true, type: Types.ObjectId })
  targetId: Types.ObjectId;

  @Prop({ required: true, type: String, enum: REPORT_REASONS })
  reason: (typeof REPORT_REASONS)[number];
}

export const ReportSchema = SchemaFactory.createForClass(Report);
