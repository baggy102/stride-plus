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
