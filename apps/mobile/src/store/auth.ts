import { create } from 'zustand';
import axios from 'axios';
import * as SecureStorage from '@/utils/secureStorage';
import client, { BASE_URL } from '@/api/client';
import { extractMessage } from '@/api/errors';

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
  error: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrating: true,
  isLoading: false,
  error: null,

  hydrate: async () => {
    try {
      const token = await SecureStorage.getItem('access_token');
      if (!token) return;
      const { data } = await client.get<User>('/users/me');
      set({ user: data, isAuthenticated: true });
    } catch {
      await SecureStorage.deleteItem('access_token');
      await SecureStorage.deleteItem('refresh_token');
    } finally {
      set({ isHydrating: false });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
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
      set({ error: extractMessage(e) });
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
    set({ user: null, isAuthenticated: false, error: null });
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await client.post<{
        accessToken: string;
        refreshToken: string;
        user: User;
      }>('/auth/register', { username, email, password });
      await SecureStorage.setItem('access_token', data.accessToken);
      await SecureStorage.setItem('refresh_token', data.refreshToken);
      set({ user: data.user, isAuthenticated: true });
    } catch (e) {
      set({ error: extractMessage(e) });
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

  clearError: () => set({ error: null }),
}));
