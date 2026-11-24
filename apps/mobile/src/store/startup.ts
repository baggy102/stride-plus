// 앱 시작 판단(순수 함수). 저장소·네트워크 없이 테스트할 수 있게 auth.ts와 나눴다(startup.test.mjs).

/** GET /users/me · POST /auth/refresh의 user와 같은 모양 */
export interface User {
  _id: string;
  email: string;
  username: string;
  profileImageUrl?: string;
}

/** 서버 응답·캐시에서 읽은 값을 User로. 모양이 다르면 null */
export function parseUser(value: unknown): User | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v._id !== 'string' || !v._id || typeof v.email !== 'string' || typeof v.username !== 'string') return null;
  const user: User = { _id: v._id, email: v.email, username: v.username };
  if (typeof v.profileImageUrl === 'string') user.profileImageUrl = v.profileImageUrl;
  return user;
}

export function parseCachedUser(json: string | null): User | null {
  if (!json) return null;
  try {
    return parseUser(JSON.parse(json));
  } catch {
    return null;
  }
}

export type StartupPlan =
  /** 토큰 없음 — 지금처럼 로그인 화면 */
  | { kind: 'signed_out' }
  /** 바로 피드 화면으로 보내고 세션은 뒤에서 확인한다 */
  | { kind: 'optimistic'; user: User }
  /** 보여 줄 사용자를 알 수 없다 — 확인을 기다린 뒤 들어간다(예전 방식) */
  | { kind: 'verify_first' };

export interface StartupInput {
  accessToken: string | null;
  refreshToken: string | null;
  /** 지난 GET /users/me 응답(JSON) */
  cachedUser: string | null;
  /** access 토큰 페이로드(서명 검증 없이 읽은 값) */
  claims: Record<string, unknown> | null;
}

/**
 * 토큰이 둘 다 있으면 바로 피드 화면으로 간다. 사용자는 캐시에서, 캐시가 없으면(이 기능 전 버전에서 로그인한 경우)
 * 토큰의 sub·email로 채운다. 캐시가 다른 계정 것이면 쓰지 않는다.
 */
export function planStartup({ accessToken, refreshToken, cachedUser, claims }: StartupInput): StartupPlan {
  if (!accessToken) return { kind: 'signed_out' };
  if (!refreshToken) return { kind: 'verify_first' };
  const sub = typeof claims?.sub === 'string' && claims.sub ? claims.sub : null;
  const cached = parseCachedUser(cachedUser);
  if (cached && (!sub || cached._id === sub)) return { kind: 'optimistic', user: cached };
  if (sub) {
    const email = typeof claims?.email === 'string' ? claims.email : '';
    return { kind: 'optimistic', user: { _id: sub, email, username: '' } };
  }
  return { kind: 'verify_first' };
}
