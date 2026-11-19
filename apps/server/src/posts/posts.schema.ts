import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ timestamps: true })
export class Post {
  // Types.ObjectId(bson 클래스)를 type에 쓰면 @nestjs/mongoose에서 Mixed가 되어 문자열이 저장된다
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Run' })
  runId: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  likes: Types.ObjectId[];
}

export const PostSchema = SchemaFactory.createForClass(Post);
// 러닝 하나에 포스트 하나. 응원 집계·토글이 runId로 찾는다
PostSchema.index({ runId: 1 }, { unique: true });
