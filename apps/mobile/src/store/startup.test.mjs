// node --test --experimental-strip-types 로 실행한다(package.json "test")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCachedUser, parseUser, planStartup } from './startup.ts';

const me = { _id: 'u1', email: 'a@b.com', username: 'alice', profileImageUrl: 'https://cdn/a.png' };
const claims = { sub: 'u1', email: 'a@b.com', exp: 1 };
const base = { accessToken: 'at', refreshToken: 'rt', cachedUser: JSON.stringify(me), claims };

test('토큰이 없으면 지금처럼 로그인 화면', () => {
  assert.deepEqual(planStartup({ ...base, accessToken: null }), { kind: 'signed_out' });
  assert.deepEqual(planStartup({ accessToken: null, refreshToken: null, cachedUser: null, claims: null }), { kind: 'signed_out' });
});

test('토큰과 캐시가 있으면 서버를 기다리지 않고 바로 피드 화면으로', () => {
  assert.deepEqual(planStartup(base), { kind: 'optimistic', user: me });
  // 토큰 페이로드를 못 읽어도 캐시로 들어간다(확인은 뒤에서)
  assert.deepEqual(planStartup({ ...base, claims: null }), { kind: 'optimistic', user: me });
});

test('캐시가 없으면(이 기능 전 버전에서 로그인) 토큰의 sub·email로 바로 들어간다', () => {
  assert.deepEqual(planStartup({ ...base, cachedUser: null }), {
    kind: 'optimistic',
    user: { _id: 'u1', email: 'a@b.com', username: '' },
  });
});

test('캐시가 다른 계정 것이면 쓰지 않는다', () => {
  const other = JSON.stringify({ ...me, _id: 'u2', username: 'bob' });
  assert.deepEqual(planStartup({ ...base, cachedUser: other }).user, { _id: 'u1', email: 'a@b.com', username: '' });
});

test('보여 줄 사용자를 알 수 없거나 refresh 토큰이 없으면 확인을 기다린다(예전 방식)', () => {
  assert.deepEqual(planStartup({ ...base, cachedUser: null, claims: null }), { kind: 'verify_first' });
  assert.deepEqual(planStartup({ ...base, cachedUser: 'not json', claims: {} }), { kind: 'verify_first' });
  assert.deepEqual(planStartup({ ...base, refreshToken: null }), { kind: 'verify_first' });
});

test('응답·캐시 모양 검사', () => {
  assert.deepEqual(parseUser(me), me);
  assert.deepEqual(parseUser({ _id: 'u1', email: 'a@b.com', username: '', passwordHash: 'x' }), { _id: 'u1', email: 'a@b.com', username: '' });
  for (const bad of [null, undefined, 'u1', [], {}, { _id: '', email: 'a', username: 'b' }, { _id: 1, email: 'a', username: 'b' }, { _id: 'u1', username: 'b' }]) {
    assert.equal(parseUser(bad), null);
  }
  assert.equal(parseCachedUser(null), null);
  assert.equal(parseCachedUser('{'), null);
  assert.deepEqual(parseCachedUser(JSON.stringify(me)), me);
});
