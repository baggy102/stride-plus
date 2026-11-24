import { create } from 'zustand';
import axios from 'axios';
import * as SecureStorage from '@/utils/secureStorage';
import client, { BASE_URL, refreshIfExpiring, refreshSession, type RefreshResponse } from '@/api/client';
import { endsSession } from '@/api/session';
import { extractMessage, serverMessage } from '@/api/errors';
import { LEGAL_VERSIONS } from '@/config/legal';
import { decodeJwtPayload } from '@/utils/jwt';
import { parseUser, planStartup, type User } from './startup';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  isLoading: boolean;
  /** 화면에 보여 줄 오류 문구(한국어) */
  error: string | null;
  /** 서버가 보낸 아는 오류 코드(banned_word 등). 가입 화면이 고칠 단계를 고를 때만 쓴다 */
  errorCode: string | null;
  hydrate: () => Promise<void>;
  /** 앱이 다시 활성화됐을 때: 곧 만료될 토큰을 미리 갱신하고, 아직 확인하지 못한 세션을 다시 확인한다 */
  resume: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 계정 삭제(A6). 실패하면 예외를 그대로 던진다 — 화면이 오류를 표시한다 */
  deleteAccount: () => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
}

// 가입이 모르는 이유로 거절됐을 때(TERMS #21)
const REGISTER_FAILED = '가입하지 못했어요. 입력한 정보를 확인하고 다시 시도해 주세요.';

// 지난 GET /users/me 응답. 다음 시작 때 서버를 기다리지 않고 바로 피드 화면을 그리는 데 쓴다
const USER_KEY = 'auth_user';

// 로그인·로그아웃마다 올린다. 뒤에서 끝난 세션 확인이 이미 끝난(또는 바뀐) 세션을 되살리지 않게
let epoch = 0;
// 이번 실행에서 서버로 세션을 확인했는가(네트워크 오류로 못 했으면 다음 활성화 때 다시)
let verified = false;
let verifying: Promise<void> | null = null;

const saveUser = (user: User) => SecureStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});

async function clearSession() {
  await SecureStorage.deleteItem('access_token');
  await SecureStorage.deleteItem('refresh_token');
  await SecureStorage.deleteItem(USER_KEY).catch(() => {});
}

export const useAuthStore = create<AuthStore>((set, get) => {
  // 새 세션 시작(로그인·가입). 받은 user를 캐시해 다음 시작 때 바로 쓴다
  async function startSession(data: { accessToken: string; refreshToken: string; user: User }) {
    epoch += 1;
    verified = true;
    await SecureStorage.setItem('access_token', data.accessToken);
    await SecureStorage.setItem('refresh_token', data.refreshToken);
    await saveUser(data.user);
    set({ user: data.user, isAuthenticated: true });
  }

  /**
   * 뒤에서 세션을 확인한다: 갱신 중이면 그 응답의 user를, 없으면(갱신 안 함·예전 서버) GET /users/me.
   * 확실한 인증 실패(갱신 401·403, 지워진 계정)만 로그아웃한다. 네트워크 오류·시간 초과·서버 오류는 앱에 남긴다 —
   * 화면마다 자기 네트워크 오류 상태를 보여 준다.
   */
  function verify(refreshing: Promise<RefreshResponse> | null): Promise<void> {
    if (verifying) return verifying;
    const session = epoch;
    verifying = (async () => {
      try {
        const refreshed = refreshing ? parseUser((await refreshing).user) : null;
        const user = refreshed ?? parseUser((await client.get('/users/me')).data);
        if (session !== epoch) return;
        if (!user) {
          // 모양이 다른 응답은 서버 문제로 보고 지금 사용자(캐시)를 둔다
          set({ isAuthenticated: true });
          return;
        }
        verified = true;
        set({ user, isAuthenticated: true });
        await saveUser(user);
      } catch (error) {
        if (session !== epoch) return; // 갱신 401로 이미 로그아웃했거나, 그 사이 다른 계정으로 바뀌었다
        const res = axios.isAxiosError(error) ? error.response : undefined;
        if (endsSession(res?.status, res?.data?.message)) {
          await get().logout().catch(() => {}); // 뒤에서 도는 확인이라 오류를 밖으로 내보내지 않는다
          return;
        }
        set({ isAuthenticated: true });
      }
    })().finally(() => { verifying = null; });
    return verifying;
  }

  return {
    user: null,
    isAuthenticated: false,
    isHydrating: true,
    isLoading: false,
    error: null,
    errorCode: null,

    hydrate: async () => {
      try {
        const [accessToken, refreshToken, cachedUser] = await Promise.all([
          SecureStorage.getItem('access_token'),
          SecureStorage.getItem('refresh_token'),
          SecureStorage.getItem(USER_KEY),
        ]);
        const plan = planStartup({
          accessToken,
          refreshToken,
          cachedUser,
          claims: accessToken ? decodeJwtPayload(accessToken) : null,
        });
        if (plan.kind === 'signed_out') return;

        // 곧 만료될 토큰은 피드 화면을 그리기 전에 갱신을 시작해 둔다 — 첫 화면 요청이 이 갱신을 기다렸다가 새 토큰으로 한 번에 간다
        const refreshing = refreshIfExpiring(accessToken);
        if (plan.kind === 'optimistic') {
          set({ user: plan.user, isAuthenticated: true, isHydrating: false });
          void verify(refreshing);
          return;
        }
        await verify(refreshing);
      } catch {
        // 저장소를 읽지 못했다 — 지금처럼 로그인 화면으로 간다
      } finally {
        set({ isHydrating: false });
      }
    },

    resume: async () => {
      if (!get().isAuthenticated) return;
      try {
        const refreshing = refreshIfExpiring(await SecureStorage.getItem('access_token'));
        if (refreshing || !verified) await verify(refreshing);
      } catch {
        // verify가 오류를 처리한다. 저장소 오류면 다음 활성화나 다음 401 때 다시
      }
    },

    login: async (email, password) => {
      set({ isLoading: true, error: null, errorCode: null });
      try {
        const { data } = await client.post<{
          accessToken: string;
          refreshToken: string;
          user: User;
        }>('/auth/login', { email, password });
        await startSession(data);
      } catch (e) {
        const invalid = axios.isAxiosError(e) && e.response?.status === 401;
        set({ error: invalid ? '이메일 또는 비밀번호가 맞지 않아요.' : extractMessage(e) });
      } finally {
        set({ isLoading: false });
      }
    },

    logout: async () => {
      epoch += 1;
      verified = false;
      // 갱신 실패로 불릴 때는 client.ts가 이미 토큰을 지웠으므로 서버 호출을 건너뛴다.
      // 서버 호출이 실패해도 기기에서는 로그아웃한다. 401 인터셉터와 엮이지 않게 axios를 직접 쓴다.
      const refreshToken = await SecureStorage.getItem('refresh_token');
      if (refreshToken) {
        await axios.post(`${BASE_URL}/auth/logout`, { refreshToken }, { timeout: 10_000 }).catch(() => {});
      }
      await clearSession();
      set({ user: null, isAuthenticated: false, error: null, errorCode: null });
    },

    deleteAccount: async () => {
      await client.delete('/users/me');
      epoch += 1;
      verified = false;
      await clearSession();
      set({ user: null, isAuthenticated: false, error: null, errorCode: null });
    },

    register: async (username, email, password) => {
      set({ isLoading: true, error: null, errorCode: null });
      try {
        const { data } = await client.post<{
          accessToken: string;
          refreshToken: string;
          user: User;
        }>('/auth/register', {
          username,
          email,
          password,
          // 가입 화면은 필수 약관 3종에 모두 동의해야 이 함수를 부른다(C5)
          termsVersion: LEGAL_VERSIONS.terms,
          privacyVersion: LEGAL_VERSIONS.privacy,
          locationVersion: LEGAL_VERSIONS.location,
        });
        await startSession(data);
      } catch (e) {
        set({ error: extractMessage(e, REGISTER_FAILED), errorCode: serverMessage(e) });
      } finally {
        set({ isLoading: false });
      }
    },

    // client.ts와 같은 단일 비행 갱신을 쓴다(refresh 토큰이 겹쳐 돌면 세션이 끝난다)
    refreshToken: async () => {
      await refreshSession();
    },

    clearError: () => set({ error: null, errorCode: null }),
  };
});
