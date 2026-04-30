import axios from 'axios';
import * as SecureStorage from '@/utils/secureStorage';
import Constants from 'expo-constants';

const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3000';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
});

// _layout.tsx 에서 등록 — 리프레시 토큰 만료 시 호출
let onUnauthenticated: (() => void) | null = null;
export const registerUnauthenticatedHandler = (fn: () => void) => {
  onUnauthenticated = fn;
};

// ── Request: access_token 헤더 첨부 ─────────────────────────────────────────
client.interceptors.request.use(async (config) => {
  const token = await SecureStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: 401 시 토큰 갱신 후 재시도 (큐 패턴) ──────────────────────────
let isRefreshing = false;
let queue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const drainQueue = (err: unknown, token?: string) => {
  queue.forEach(({ resolve, reject }) => (err ? reject(err) : resolve(token!)));
  queue = [];
};

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return client(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await SecureStorage.getItem('refresh_token');
      if (!refreshToken) throw new Error('no_refresh_token');

      const { data } = await axios.post<{ accessToken: string }>(
        `${BASE_URL}/auth/refresh`,
        { refreshToken },
      );

      await SecureStorage.setItem('access_token', data.accessToken);
      client.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;

      drainQueue(null, data.accessToken);
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return client(original);
    } catch (refreshError) {
      drainQueue(refreshError);
      await SecureStorage.deleteItem('access_token');
      await SecureStorage.deleteItem('refresh_token');
      onUnauthenticated?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default client;
