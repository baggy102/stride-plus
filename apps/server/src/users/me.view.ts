import type { User } from './users.schema';

/** GET /users/me와 POST /auth/refresh가 함께 쓰는 「내 정보」 응답 모양. 앱은 이 값을 캐시해 두고 다음 시작 때 바로 쓴다 */
export interface MeView {
  _id: unknown;
  email: string;
  username: string;
  profileImageUrl?: string;
}

// passwordHash·blocked·consents 같은 내부 필드는 내보내지 않는다
export function toMeView(user: Pick<User, 'email' | 'username' | 'profileImageUrl'> & { _id: unknown }): MeView {
  return {
    _id: user._id,
    email: user.email,
    username: user.username,
    profileImageUrl: user.profileImageUrl,
  };
}
