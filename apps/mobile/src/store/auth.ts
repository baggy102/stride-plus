import { create } from 'zustand';
import * as SecureStorage from '@/utils/secureStorage';
import client from '@/api/client';
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
    const { data } = await client.post<{ accessToken: string }>('/auth/refresh', {
      refreshToken: token,
    });
    await SecureStorage.setItem('access_token', data.accessToken);
  },

  clearError: () => set({ error: null }),
}));
