import { model } from 'mongoose';
import { UserSchema } from './users.schema';

describe('UserSchema role', () => {
  const UserModel = model('UserSchemaSpec', UserSchema);

  it('기본값은 user', () => {
    expect(new UserModel({ email: 'a@b.c', passwordHash: 'x' }).role).toBe('user');
  });

  it('user·operator 말고는 거부한다', () => {
    expect(new UserModel({ email: 'a@b.c', passwordHash: 'x', role: 'operator' }).validateSync()).toBeUndefined();
    expect(new UserModel({ email: 'a@b.c', passwordHash: 'x', role: 'admin' }).validateSync()?.errors.role).toBeDefined();
  });
});

describe('UserSchema 인덱스', () => {
  it('나를 차단한 사용자 조회(blocked)에 인덱스', () => {
    expect(UserSchema.indexes().map(([fields]) => fields)).toContainEqual({ blocked: 1 });
  });
});
