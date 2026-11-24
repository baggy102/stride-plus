// node --test --experimental-strip-types 로 실행한다(package.json "test")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwtPayload, expiresWithin, jwtExpiresAt } from './jwt.ts';

// 서명은 검증하지 않으므로 가짜 서명으로 만든다
const token = (payload) =>
  ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)]
    .map((part) => Buffer.from(part).toString('base64url'))
    .concat('sig')
    .join('.');

const NOW = 1_800_000_000_000;

test('페이로드를 읽는다(sub·email·exp)', () => {
  const t = token({ sub: '65f0a1b2c3d4e5f6a7b8c9d0', email: 'runner@example.com', iat: 1_799_999_100, exp: 1_800_000_000 });
  assert.deepEqual(decodeJwtPayload(t), { sub: '65f0a1b2c3d4e5f6a7b8c9d0', email: 'runner@example.com', iat: 1_799_999_100, exp: 1_800_000_000 });
  assert.equal(jwtExpiresAt(t), 1_800_000_000_000);
});

test('UTF-8 문자와 패딩 길이가 다른 페이로드도 읽는다', () => {
  for (const email of ['a@b.co', 'ab@b.co', 'abc@b.co', '러너@예시.한국']) {
    assert.equal(decodeJwtPayload(token({ email }))?.email, email);
  }
  // 표준 base64(+/=)로 인코딩된 페이로드도 받아 준다
  const std = ['e30', Buffer.from('{"exp":1}').toString('base64'), 'sig'].join('.');
  assert.equal(jwtExpiresAt(std), 1000);
});

test('형식이 틀리면 null', () => {
  for (const bad of ['', 'abc', 'a.b', 'a.b.c.d', 'x.@@@.y', `x.${Buffer.from('not json').toString('base64url')}.y`, `x.${Buffer.from('[1]').toString('base64url')}.y`, `x.${Buffer.from([0xff, 0xfe]).toString('base64url')}.y`]) {
    assert.equal(decodeJwtPayload(bad), null, bad);
  }
  assert.equal(jwtExpiresAt(token({ sub: 'u1' })), null);
  assert.equal(jwtExpiresAt(token({ exp: '1800000000' })), null);
});

test('2분 안에 만료되거나 이미 만료됐으면 미리 갱신한다', () => {
  const window = 2 * 60_000;
  const exp = (msFromNow) => token({ exp: (NOW + msFromNow) / 1000 });
  assert.equal(expiresWithin(exp(15 * 60_000), NOW, window), false); // 막 받은 15분 토큰
  assert.equal(expiresWithin(exp(2 * 60_000 + 1000), NOW, window), false);
  assert.equal(expiresWithin(exp(2 * 60_000), NOW, window), true); // 경계
  assert.equal(expiresWithin(exp(30_000), NOW, window), true);
  assert.equal(expiresWithin(exp(-60 * 60_000), NOW, window), true); // 한참 쉬고 돌아왔다
});

test('만료 시각을 읽을 수 없으면 갱신한다(새 토큰을 받는 편이 안전하다)', () => {
  assert.equal(expiresWithin('garbage', NOW, 120_000), true);
  assert.equal(expiresWithin(token({ sub: 'u1' }), NOW, 120_000), true);
});
