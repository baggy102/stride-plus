import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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
}

export const UserSchema = SchemaFactory.createForClass(User);
