import { create } from 'zustand';
import axios from 'axios';
import * as SecureStorage from '@/utils/secureStorage';
import client, { BASE_URL } from '@/api/client';
import { extractMessage, serverMessage } from '@/api/errors';
import { LEGAL_VERSIONS } from '@/config/legal';

interface User {
  _id: string;
  email: string;
  username: string;
  profileImageUrl?: string;
}

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

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrating: true,
  isLoading: false,
  error: null,
  errorCode: null,

  hydrate: async () => {
    try {
      const token = await SecureStorage.getItem('access_token');
      if (!token) return;
      const { data } = await client.get<User>('/users/me');
      set({ user: data, isAuthenticated: true });
    } catch {
      // 토큰은 지우지 않는다. 갱신 실패(401)면 client.ts가 이미 지웠고,
      // 네트워크 오류·서버 오류라면 다음 실행에서 다시 확인한다.
    } finally {
      set({ isHydrating: false });
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
      await SecureStorage.setItem('access_token', data.accessToken);
      await SecureStorage.setItem('refresh_token', data.refreshToken);
      set({ user: data.user, isAuthenticated: true });
    } catch (e) {
      const invalid = axios.isAxiosError(e) && e.response?.status === 401;
      set({ error: invalid ? '이메일 또는 비밀번호가 맞지 않아요.' : extractMessage(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    // 갱신 실패로 불릴 때는 client.ts가 이미 토큰을 지웠으므로 서버 호출을 건너뛴다.
    // 서버 호출이 실패해도 기기에서는 로그아웃한다. 401 인터셉터와 엮이지 않게 axios를 직접 쓴다.
    const refreshToken = await SecureStorage.getItem('refresh_token');
    if (refreshToken) {
      await axios.post(`${BASE_URL}/auth/logout`, { refreshToken }, { timeout: 10_000 }).catch(() => {});
    }
    await SecureStorage.deleteItem('access_token');
    await SecureStorage.deleteItem('refresh_token');
    set({ user: null, isAuthenticated: false, error: null, errorCode: null });
  },

  deleteAccount: async () => {
    await client.delete('/users/me');
    await SecureStorage.deleteItem('access_token');
    await SecureStorage.deleteItem('refresh_token');
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
      await SecureStorage.setItem('access_token', data.accessToken);
      await SecureStorage.setItem('refresh_token', data.refreshToken);
      set({ user: data.user, isAuthenticated: true });
    } catch (e) {
      set({ error: extractMessage(e, REGISTER_FAILED), errorCode: serverMessage(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshToken: async () => {
    const token = await SecureStorage.getItem('refresh_token');
    if (!token) throw new Error('no_refresh_token');
    const { data } = await client.post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
      refreshToken: token,
    });
    await SecureStorage.setItem('access_token', data.accessToken);
    await SecureStorage.setItem('refresh_token', data.refreshToken);
  },

  clearError: () => set({ error: null, errorCode: null }),
}));
