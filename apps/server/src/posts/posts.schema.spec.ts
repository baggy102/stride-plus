import { model, Types } from 'mongoose';
import { PostSchema } from './posts.schema';

// @Prop({ type: Types.ObjectId })는 Mixed가 되어 문자열이 그대로 저장됐다(응원이 포스트를 못 찾음)
describe('PostSchema ID 타입', () => {
  it('runId·userId·likes는 ObjectId 경로다', () => {
    expect(PostSchema.path('runId').instance).toBe('ObjectId');
    expect(PostSchema.path('userId').instance).toBe('ObjectId');
    expect((PostSchema.path('likes') as unknown as { caster: { instance: string } }).caster.instance).toBe('ObjectId');
  });

  it('문자열 ID를 넣어도 ObjectId로 저장한다', () => {
    const PostModel = model('PostSchemaSpec', PostSchema);
    const runId = '64b7f0c2a1b2c3d4e5f60a01';
    const post = new PostModel({ runId, userId: '64b7f0c2a1b2c3d4e5f60a02', likes: ['64b7f0c2a1b2c3d4e5f60a03'] });
    expect(post.runId).toBeInstanceOf(Types.ObjectId);
    expect(post.userId).toBeInstanceOf(Types.ObjectId);
    expect(post.likes[0]).toBeInstanceOf(Types.ObjectId);
    expect(String(post.runId)).toBe(runId);
  });
});
