// node --test --experimental-strip-types 로 실행한다(package.json "test")
// 앱 시작 흐름을 auth.ts + client.ts 그대로 돌린다. axios·expo-constants·보안 저장소만 가짜로 바꿔 끼우고,
// 서버 응답은 테스트마다 globalThis.__http로 정한다.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const srcUrl = new URL('../', import.meta.url).href;
const axiosSrc = `
  function create(defaults = {}) {
    const onRequest = [];
    const onResponse = [];
    async function request(input) {
      let config = { ...defaults, ...input, headers: { ...(input.headers || {}) } };
      for (const fn of onRequest) config = await fn(config);
      let result;
      try {
        result = Promise.resolve(await globalThis.__http(config));
      } catch (e) {
        result = Promise.reject(Object.assign(e, { isAxiosError: true, config }));
      }
      for (const [ok, fail] of onResponse) result = result.then(ok, fail);
      return result;
    }
    const instance = (config) => request(config);
    instance.get = (url, config) => request({ ...config, method: 'get', url });
    instance.delete = (url, config) => request({ ...config, method: 'delete', url });
    instance.post = (url, data, config) => request({ ...config, method: 'post', url, data });
    instance.interceptors = {
      request: { use: (fn) => onRequest.push(fn) },
      response: { use: (ok, fail) => onResponse.push([ok, fail]) },
    };
    return instance;
  }
  const axios = create();
  axios.create = create;
  axios.isAxiosError = (e) => !!(e && e.isAxiosError);
  export default axios;
`;
const storageSrc = `
  export const getItem = async (k) => globalThis.__storage.get(k) ?? null;
  export const setItem = async (k, v) => { globalThis.__storage.set(k, v); };
  export const deleteItem = async (k) => { globalThis.__storage.delete(k); };
`;
const hooks = `
  const src = ${JSON.stringify(srcUrl)};
  const map = {
    axios: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(axiosSrc)}),
    'expo-constants': 'data:text/javascript,' + encodeURIComponent('export default { expoConfig: { extra: {} } };'),
    '@/utils/secureStorage': 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(storageSrc)}),
  };
  export async function resolve(specifier, context, next) {
    if (map[specifier]) return { url: map[specifier], shortCircuit: true };
    if (specifier.startsWith('@/')) return { url: new URL(specifier.slice(2) + '.ts', src).href, shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts') && !/\\.[mc]?[jt]s$/.test(specifier)) {
      return { url: new URL(specifier + '.ts', context.parentURL).href, shortCircuit: true };
    }
    return next(specifier, context);
  }
`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const { useAuthStore } = await import('./auth.ts');
const { default: client, registerUnauthenticatedHandler } = await import('../api/client.ts');
const store = () => useAuthStore.getState();
registerUnauthenticatedHandler(() => store().logout()); // _layout.tsx와 같다

// ── 가짜 서버 ────────────────────────────────────────────────────────────────
const jwt = (payload) =>
  ['{"alg":"HS256"}', JSON.stringify(payload)].map((p) => Buffer.from(p).toString('base64url')).concat('sig').join('.');
const nowSec = () => Math.floor(Date.now() / 1000);
const FRESH = jwt({ sub: 'u1', email: 'a@b.com', exp: nowSec() + 15 * 60 });
const EXPIRED = jwt({ sub: 'u1', email: 'a@b.com', exp: nowSec() - 60 * 60 }); // 15분 넘게 쉬었다
const NEW_AT = jwt({ sub: 'u1', email: 'a@b.com', exp: nowSec() + 15 * 60, n: 2 });
const ME = { _id: 'u1', email: 'a@b.com', username: 'alice', profileImageUrl: 'https://cdn/a.png' };
const CACHED = { _id: 'u1', email: 'a@b.com', username: 'alice-old' };

const fail = (status, data = {}) => { throw Object.assign(new Error(`status ${status}`), { response: { status, data } }); };
const timeout = () => { throw Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' }); };
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };

let calls;
function serve(routes) {
  calls = [];
  globalThis.__http = async (config) => {
    const path = config.url.replace(/^https?:\/\/[^/]+/, '');
    const key = `${config.method.toUpperCase()} ${path}`;
    calls.push({ key, auth: config.headers?.Authorization });
    if (!routes[key]) throw new Error(`no route: ${key}`);
    return { status: 200, data: await routes[key](config) };
  };
}
const keys = () => calls.map((c) => c.key);
const authed = (config, token) => { if (config.headers.Authorization !== `Bearer ${token}`) fail(401); };

function saved({ access = FRESH, refresh = 'rt-1', user = CACHED } = {}) {
  globalThis.__storage = new Map();
  if (access) globalThis.__storage.set('access_token', access);
  if (refresh) globalThis.__storage.set('refresh_token', refresh);
  if (user) globalThis.__storage.set('auth_user', JSON.stringify(user));
}

beforeEach(async () => {
  globalThis.__storage = new Map();
  serve({});
  await store().logout(); // 지난 테스트의 세션을 끝낸다(토큰이 없어 서버 호출 없음)
  useAuthStore.setState({ isHydrating: true });
  calls = [];
});

// ── 시작 흐름 ────────────────────────────────────────────────────────────────
test('토큰이 없으면 지금처럼 로그인 화면(서버 호출 없음)', async () => {
  await store().hydrate();
  assert.equal(store().isHydrating, false);
  assert.equal(store().isAuthenticated, false);
  assert.deepEqual(keys(), []);
});

test('오래 쉬고 열면: 캐시한 사용자로 바로 피드 화면, 갱신은 하나, 첫 요청은 새 토큰으로 한 번에(401·/users/me 없음)', async () => {
  saved({ access: EXPIRED });
  const refresh = deferred();
  serve({
    'POST /auth/refresh': () => refresh.promise,
    'GET /runs/feed': (c) => { authed(c, NEW_AT); return []; },
  });

  await store().hydrate();
  // 서버 응답 전에 이미 피드 화면으로 들어간다
  assert.equal(store().isHydrating, false);
  assert.equal(store().isAuthenticated, true);
  assert.deepEqual(store().user, CACHED);
  assert.deepEqual(keys(), ['POST /auth/refresh']);

  // 지도 피드가 바로 요청을 보내도 갱신을 기다렸다가 새 토큰으로 간다
  const feed = client.get('/runs/feed');
  await settle();
  assert.deepEqual(keys(), ['POST /auth/refresh']);
  refresh.resolve({ accessToken: NEW_AT, refreshToken: 'rt-2', user: ME });
  await feed;
  await settle();

  assert.deepEqual(keys(), ['POST /auth/refresh', 'GET /runs/feed']);
  assert.deepEqual(store().user, ME);
  assert.equal(globalThis.__storage.get('access_token'), NEW_AT);
  assert.equal(globalThis.__storage.get('refresh_token'), 'rt-2');
  assert.deepEqual(JSON.parse(globalThis.__storage.get('auth_user')), ME);
});

test('예전 서버(갱신 응답에 user 없음)면 갱신 뒤 /users/me로 확인한다', async () => {
  saved({ access: EXPIRED });
  serve({
    'POST /auth/refresh': () => ({ accessToken: NEW_AT, refreshToken: 'rt-2' }),
    'GET /users/me': (c) => { authed(c, NEW_AT); return ME; },
  });
  await store().hydrate();
  await settle();
  assert.deepEqual(keys(), ['POST /auth/refresh', 'GET /users/me']);
  assert.deepEqual(store().user, ME);
});

test('토큰이 넉넉하면 갱신 없이 /users/me만 뒤에서 확인한다', async () => {
  saved();
  serve({ 'GET /users/me': (c) => { authed(c, FRESH); return ME; } });
  await store().hydrate();
  assert.deepEqual(store().user, CACHED);
  await settle();
  assert.deepEqual(keys(), ['GET /users/me']);
  assert.deepEqual(store().user, ME);
});

test('캐시가 없으면(업데이트 직후) 토큰의 _id로 바로 들어가고 확인 뒤 채운다', async () => {
  saved({ user: null });
  serve({ 'GET /users/me': () => ME });
  await store().hydrate();
  assert.equal(store().isAuthenticated, true);
  assert.equal(store().user._id, 'u1');
  await settle();
  assert.deepEqual(store().user, ME);
  assert.deepEqual(JSON.parse(globalThis.__storage.get('auth_user')), ME);
});

// ── 네트워크 오류는 로그인 화면으로 보내지 않는다 ─────────────────────────────
test('갱신이 시간 초과되면 앱에 남고 토큰도 그대로, 기다리던 요청은 네트워크 오류로 끝난다(멈추지 않음)', { timeout: 5000 }, async () => {
  saved({ access: EXPIRED });
  serve({
    'POST /auth/refresh': timeout,
    'GET /runs/feed': (c) => { authed(c, NEW_AT); return []; },
    'GET /runs/mine': (c) => { authed(c, NEW_AT); return []; },
  });
  await store().hydrate();
  const settled = await Promise.allSettled([client.get('/runs/feed'), client.get('/runs/mine')]);
  await settle();

  assert.deepEqual(settled.map((s) => s.status), ['rejected', 'rejected']);
  assert.equal(settled[0].reason.code, 'ECONNABORTED'); // 화면은 「네트워크 연결을 확인하고…」를 보여 준다
  assert.equal(store().isAuthenticated, true);
  assert.deepEqual(store().user, CACHED);
  assert.equal(globalThis.__storage.get('access_token'), EXPIRED);
  assert.equal(globalThis.__storage.get('refresh_token'), 'rt-1');
});

test('오프라인으로 시작하면 앱에 남고, 다시 활성화될 때 확인한다', async () => {
  saved();
  serve({ 'GET /users/me': timeout });
  await store().hydrate();
  await settle();
  assert.equal(store().isAuthenticated, true);
  assert.deepEqual(store().user, CACHED);

  serve({ 'GET /users/me': () => ME });
  await store().resume();
  assert.deepEqual(keys(), ['GET /users/me']);
  assert.deepEqual(store().user, ME);

  // 확인을 마쳤고 토큰도 넉넉하면 활성화 때 서버를 부르지 않는다
  calls = [];
  await store().resume();
  assert.deepEqual(keys(), []);
});

test('서버 오류(5xx)도 로그인 화면으로 보내지 않는다', async () => {
  saved();
  serve({ 'GET /users/me': () => fail(503) });
  await store().hydrate();
  await settle();
  assert.equal(store().isAuthenticated, true);
});

// ── 확실한 인증 실패만 로그아웃 ───────────────────────────────────────────────
test('refresh 토큰이 폐기됐으면(401) 로그인 화면으로, 토큰과 캐시를 지운다', async () => {
  saved({ access: EXPIRED });
  serve({ 'POST /auth/refresh': () => fail(401, { message: 'Refresh token expired or revoked' }) });
  await store().hydrate();
  assert.equal(store().isAuthenticated, true); // 처음에는 바로 들어갔다가
  await settle();
  assert.equal(store().isAuthenticated, false);
  assert.equal(store().user, null);
  assert.equal(globalThis.__storage.size, 0);
  assert.deepEqual(keys(), ['POST /auth/refresh']); // 이미 거절된 토큰으로 /auth/logout을 또 부르지 않는다
});

test('다른 기기에서 계정을 지웠으면(404 user_not_found) 로그아웃한다', async () => {
  saved();
  serve({
    'GET /users/me': () => fail(404, { message: 'user_not_found' }),
    'POST /auth/logout': () => undefined,
  });
  await store().hydrate();
  await settle();
  assert.equal(store().isAuthenticated, false);
  assert.equal(globalThis.__storage.size, 0);
});

test('확인 중에 로그아웃하면 늦게 온 응답이 세션을 되살리지 않는다', async () => {
  saved();
  const me = deferred();
  serve({ 'GET /users/me': () => me.promise, 'POST /auth/logout': () => undefined });
  await store().hydrate();
  await store().logout();
  me.resolve(ME);
  await settle();
  assert.equal(store().isAuthenticated, false);
  assert.equal(store().user, null);
  assert.equal(globalThis.__storage.get('auth_user'), undefined);
});

// ── 401 재시도 ───────────────────────────────────────────────────────────────
test('여러 요청이 동시에 401을 받아도 갱신은 한 번, 모두 새 토큰으로 다시 보낸다', async () => {
  saved();
  useAuthStore.setState({ isAuthenticated: true, isHydrating: false });
  serve({
    'POST /auth/refresh': () => ({ accessToken: NEW_AT, refreshToken: 'rt-2', user: ME }),
    'GET /a': (c) => { authed(c, NEW_AT); return 'a'; },
    'GET /b': (c) => { authed(c, NEW_AT); return 'b'; },
    'GET /c': (c) => { authed(c, NEW_AT); return 'c'; },
  });
  const results = await Promise.all(['/a', '/b', '/c'].map((u) => client.get(u)));
  assert.deepEqual(results.map((r) => r.data), ['a', 'b', 'c']);
  assert.equal(keys().filter((k) => k === 'POST /auth/refresh').length, 1);
});

test('로그인하면 받은 사용자를 캐시해 다음 시작 때 쓴다', async () => {
  serve({ 'POST /auth/login': () => ({ accessToken: FRESH, refreshToken: 'rt-1', user: ME }) });
  await store().login('a@b.com', 'pw');
  assert.equal(store().isAuthenticated, true);
  assert.deepEqual(JSON.parse(globalThis.__storage.get('auth_user')), ME);
});
