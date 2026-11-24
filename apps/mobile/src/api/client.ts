import axios from 'axios';
import * as SecureStorage from '@/utils/secureStorage';
import Constants from 'expo-constants';
import { expiresWithin } from '@/utils/jwt';
import { createRefresher, type TokenPair } from './session';

// app.config.js가 EXPO_PUBLIC_API_URL → app.json extra.apiUrl 순으로 넣어 준다.
export const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:3000';

/** 모든 API 요청의 시간 제한. 토큰 갱신도 같은 값을 쓴다 */
export const REQUEST_TIMEOUT_MS = 10_000;
/** access 토큰이 이 안에 만료되면 앱 시작·활성화 때 미리 갱신한다 */
export const PROACTIVE_REFRESH_MS = 2 * 60_000;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
});

// 갱신 전용: 401 인터셉터를 거치지 않고, 시간 제한은 같다
const refreshHttp = axios.create({ baseURL: BASE_URL, timeout: REQUEST_TIMEOUT_MS });

/** POST /auth/refresh 응답. user는 새 서버만 보낸다(GET /users/me와 같은 모양) — 예전 서버면 undefined */
export interface RefreshResponse extends TokenPair {
  user?: unknown;
}

// _layout.tsx 에서 등록 — 리프레시 토큰이 확실히 거절됐을 때(401·403) 호출
let onUnauthenticated: (() => void) | null = null;
export const registerUnauthenticatedHandler = (fn: () => void) => {
  onUnauthenticated = fn;
};

const refresher = createRefresher<RefreshResponse>({
  readRefreshToken: () => SecureStorage.getItem('refresh_token'),
  post: async (refreshToken) => (await refreshHttp.post<RefreshResponse>('/auth/refresh', { refreshToken })).data,
  save: async ({ accessToken, refreshToken }) => {
    await SecureStorage.setItem('access_token', accessToken);
    await SecureStorage.setItem('refresh_token', refreshToken);
  },
  endSession: async () => {
    await SecureStorage.deleteItem('access_token');
    await SecureStorage.deleteItem('refresh_token');
    onUnauthenticated?.();
  },
  statusOf: (error) => (axios.isAxiosError(error) ? error.response?.status : undefined),
});

/** 토큰 갱신(동시에 불러도 한 번만 보낸다). 401·403이면 세션을 끝내고, 네트워크 오류·시간 초과면 토큰을 두고 오류만 던진다 */
export const refreshSession = (): Promise<RefreshResponse> => refresher.refresh();

/**
 * access 토큰이 곧 만료되면 갱신을 시작하고 그 약속을, 아니면 null을 돌려준다(진행 중인 갱신이 있으면 그것).
 * 동기로 시작하므로 이 뒤에 나가는 요청은 새 토큰을 기다렸다가 간다 — 401 → 갱신 → 재시도 왕복이 생기지 않는다.
 */
export function refreshIfExpiring(accessToken: string | null, nowMs = Date.now()): Promise<RefreshResponse> | null {
  const pending = refresher.pending();
  if (pending) return pending;
  if (!accessToken || !expiresWithin(accessToken, nowMs, PROACTIVE_REFRESH_MS)) return null;
  return refresher.refresh();
}

// ── Request: access_token 헤더 첨부 ─────────────────────────────────────────
client.interceptors.request.use(async (config) => {
  // 갱신 중이면 새 토큰을 기다린다. 갱신이 실패해도 요청은 그대로 보낸다 —
  // 네트워크 오류면 요청도 같은 오류로 끝나고, 세션이 끝났으면 토큰이 없다.
  const pending = refresher.pending();
  if (pending) await pending.catch(() => {});
  const token = await SecureStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: 401 시 토큰 갱신 후 재시도 ────────────────────────────────────
// 여러 요청이 동시에 401을 받아도 갱신은 한 번만 간다(refresher). 갱신이 실패하면(시간 초과 포함)
// 기다리던 요청도 모두 같은 오류로 끝난다 — 멈춰 있지 않는다.
client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // 로그인·가입 등 /auth/ 요청의 401은 자격 증명 오류다 — 갱신하지 않고 그대로 돌려준다
    if (error.response?.status !== 401 || !original || original._retry || original.url?.startsWith('/auth/')) {
      return Promise.reject(error);
    }
    original._retry = true;

    // 이 요청이 나간 뒤 다른 쪽이 이미 갱신했으면 새 토큰으로 다시 보내기만 한다(refresh 토큰을 한 번 더 돌리지 않게)
    const sent = String(original.headers?.Authorization ?? '');
    const stored = await SecureStorage.getItem('access_token');
    if (!stored || sent === `Bearer ${stored}`) await refresher.refresh();
    return client(original);
  },
);

export default client;
