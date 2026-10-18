import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { Consents } from '../auth/legal-versions';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: '' })
  username: string;

  @Prop({ default: '' })
  bio: string;

  @Prop()
  profileImageUrl?: string;

  @Prop({ type: [Types.ObjectId], default: [] })
  following: Types.ObjectId[];

  // 내가 차단한 사용자. 차단은 양방향으로 적용한다(RunsService.hiddenUserIds)
  @Prop({ type: [Types.ObjectId], default: [] })
  blocked: Types.ObjectId[];

  // 가입 시 동의한 약관 버전과 시각(C4). 이 기능 전에 가입한 사용자는 값이 없다
  @Prop(raw({ terms: String, privacy: String, location: String, agreedAt: Date }))
  consents?: Consents;
}

export const UserSchema = SchemaFactory.createForClass(User);
