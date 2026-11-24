// node --test --experimental-strip-types 로 실행한다(package.json "test")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRefresher, endsSession, isDefinitiveAuthStatus } from './session.ts';

// axios 오류 모양만 흉내 낸다: 응답이 있으면 status, 없으면(오프라인 · 시간 초과) response 없음
const httpError = (status) => Object.assign(new Error(`status ${status}`), { response: { status } });
const timeoutError = () => Object.assign(new Error('timeout of 10000ms exceeded'), { code: 'ECONNABORTED' });

function setup({ refreshToken = 'rt-1' } = {}) {
  const log = { posts: [], saved: [], ended: 0 };
  let respond;
  const deps = {
    readRefreshToken: async () => refreshToken,
    post: (rt) => {
      log.posts.push(rt);
      return new Promise((resolve, reject) => { respond = { resolve, reject }; });
    },
    save: async (result) => { log.saved.push(result); },
    endSession: async () => { log.ended += 1; },
    statusOf: (e) => e?.response?.status,
  };
  const refresher = createRefresher(deps);
  // post가 불릴 때까지(저장소 읽기 다음 틱) 기다렸다가 응답한다
  const reply = async (fn) => { await new Promise((r) => setImmediate(r)); fn(respond); };
  return { refresher, log, reply };
}

test('동시에 여러 번 불러도 갱신 요청은 하나만 보내고 모두 같은 결과를 받는다', async () => {
  const { refresher, log, reply } = setup();
  const calls = [refresher.refresh(), refresher.refresh(), refresher.refresh()];
  assert.equal(refresher.pending(), calls[0]);
  await reply((r) => r.resolve({ accessToken: 'at-2', refreshToken: 'rt-2', user: { _id: 'u1' } }));
  const results = await Promise.all(calls);
  assert.equal(log.posts.length, 1);
  assert.deepEqual(results.map((x) => x.accessToken), ['at-2', 'at-2', 'at-2']);
  assert.deepEqual(log.saved, [{ accessToken: 'at-2', refreshToken: 'rt-2', user: { _id: 'u1' } }]);
  assert.equal(refresher.pending(), null);
});

test('시간 초과면 기다리던 쪽이 모두 같은 오류로 바로 끝나고(멈추지 않음) 토큰은 그대로 둔다', async () => {
  const { refresher, log, reply } = setup();
  const waiting = [refresher.refresh(), refresher.refresh()];
  await reply((r) => r.reject(timeoutError()));
  const settled = await Promise.allSettled(waiting);
  assert.deepEqual(settled.map((s) => s.status), ['rejected', 'rejected']);
  assert.equal(settled[0].reason.code, 'ECONNABORTED');
  assert.equal(log.ended, 0); // 로그인 화면으로 보내지 않는다
  assert.equal(log.saved.length, 0);
  assert.equal(refresher.pending(), null); // 다음 갱신을 다시 시작할 수 있다
});

test('서버 오류(5xx)도 세션을 끝내지 않는다', async () => {
  const { refresher, log, reply } = setup();
  const p = refresher.refresh();
  await reply((r) => r.reject(httpError(503)));
  await assert.rejects(p);
  assert.equal(log.ended, 0);
});

test('refresh 토큰이 거절되면(401·403) 한 번만 세션을 끝낸다', async () => {
  for (const status of [401, 403]) {
    const { refresher, log, reply } = setup();
    const waiting = [refresher.refresh(), refresher.refresh()];
    await reply((r) => r.reject(httpError(status)));
    const settled = await Promise.allSettled(waiting);
    assert.deepEqual(settled.map((s) => s.status), ['rejected', 'rejected']);
    assert.equal(log.ended, 1, `status ${status}`);
  }
});

test('refresh 토큰이 없으면 요청 없이 세션을 끝낸다', async () => {
  const { refresher, log } = setup({ refreshToken: null });
  await assert.rejects(refresher.refresh(), /no_refresh_token/);
  assert.equal(log.posts.length, 0);
  assert.equal(log.ended, 1);
});

test('실패한 뒤에는 새 갱신을 다시 보낸다', async () => {
  const { refresher, log, reply } = setup();
  const first = refresher.refresh();
  await reply((r) => r.reject(timeoutError()));
  await assert.rejects(first);
  const second = refresher.refresh();
  await reply((r) => r.resolve({ accessToken: 'at-2', refreshToken: 'rt-2' }));
  assert.equal((await second).accessToken, 'at-2');
  assert.equal(log.posts.length, 2);
});

test('확실한 인증 실패와 지워진 계정만 세션을 끝낸다', () => {
  assert.equal(isDefinitiveAuthStatus(401), true);
  assert.equal(isDefinitiveAuthStatus(403), true);
  for (const status of [undefined, 0, 400, 404, 408, 429, 500, 502, 503, 504]) assert.equal(isDefinitiveAuthStatus(status), false, String(status));
  assert.equal(endsSession(404, 'user_not_found'), true);
  assert.equal(endsSession(404, 'Cannot GET /users/me'), false); // 경로 문제는 계정 삭제가 아니다
  assert.equal(endsSession(undefined, undefined), false); // 오프라인 · 시간 초과
  assert.equal(endsSession(500, 'Internal server error'), false);
});
