// node --test --experimental-strip-types 로 실행한다(package.json "test")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_ERROR_TEXT, UNKNOWN_ERROR_TEXT, errorText, knownServerMessage } from './errorText.ts';

test('응답이 없으면(오프라인 · 시간 초과) 네트워크 안내', () => {
  assert.equal(errorText({ network: true }), NETWORK_ERROR_TEXT);
  assert.equal(errorText({ network: true, message: 'Invalid credentials' }), NETWORK_ERROR_TEXT);
  assert.equal(NETWORK_ERROR_TEXT, '네트워크 연결을 확인하고 다시 시도해 주세요.');
});

test('아는 서버 문구는 한국어로(해요체)', () => {
  assert.equal(errorText({ network: false, message: 'Invalid credentials' }), '이메일 또는 비밀번호가 맞지 않아요.');
  assert.equal(errorText({ network: false, message: 'Email already in use' }), '이미 가입된 이메일이에요.');
  assert.equal(errorText({ network: false, message: 'user_not_found' }), '사용자를 찾을 수 없어요.');
});

test('ValidationPipe 배열은 앞에서부터 아는 문구를 찾는다', () => {
  const message = ['email must be a string', 'email must be an email'];
  assert.equal(knownServerMessage(message), 'email must be an email');
  assert.equal(errorText({ network: false, message }), '이메일 형식을 확인해 주세요.');
  assert.equal(errorText({ network: false, message: ['password must be longer than or equal to 8 characters'] }), '비밀번호는 8자 이상이어야 해요.');
});

test('모르는 문구 · 영문 메시지 · 빈 값은 대체 문구로(그대로 내보내지 않는다)', () => {
  for (const message of ['Internal server error', 'Unauthorized', ['x must be y'], undefined, null, 42]) {
    assert.equal(errorText({ network: false, message }), UNKNOWN_ERROR_TEXT);
  }
  assert.equal(UNKNOWN_ERROR_TEXT, '문제가 생겼어요. 다시 시도해 주세요.');
  assert.equal(knownServerMessage('toString'), null);
});

test('화면이 대체 문구를 정할 수 있다(가입)', () => {
  const fallback = '가입하지 못했어요. 입력한 정보를 확인하고 다시 시도해 주세요.';
  assert.equal(errorText({ network: false, message: 'Bad Request' }, fallback), fallback);
  assert.equal(errorText({ network: true }, fallback), NETWORK_ERROR_TEXT);
});
