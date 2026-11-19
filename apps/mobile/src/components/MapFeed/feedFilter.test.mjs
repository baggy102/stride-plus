import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HYPE_MIN_CHEERS, isHype, isNew, matchesFilter, safeImageUrl } from './feedFilter.ts';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

test('HYPE는 응원 수가 기준 이상일 때만, 응원 수가 없으면 아니다', () => {
  assert.equal(isHype({ cheers: HYPE_MIN_CHEERS }), true);
  assert.equal(isHype({ cheers: HYPE_MIN_CHEERS - 1 }), false);
  assert.equal(isHype({}), false);
});

test('NEW는 24시간 안, 경계(정확히 24시간)와 잘못된 날짜는 아니다', () => {
  assert.equal(isNew({ createdAt: hoursAgo(23.9) }, NOW), true);
  assert.equal(isNew({ createdAt: hoursAgo(24) }, NOW), false);
  assert.equal(isNew({ createdAt: 'nope' }, NOW), false);
});

test('필터: TOTAL은 모두, HYPE·NEW는 각 기준', () => {
  const run = { cheers: 5, createdAt: hoursAgo(48) };
  assert.equal(matchesFilter(run, 'total', NOW), true);
  assert.equal(matchesFilter(run, 'hype', NOW), true);
  assert.equal(matchesFilter(run, 'new', NOW), false);
});

test('이미지 주소: 상대 경로는 서버 주소를 붙이고, 위험한 문자는 버린다', () => {
  assert.equal(safeImageUrl('/uploads/a.jpg', 'http://10.0.0.2:3000'), 'http://10.0.0.2:3000/uploads/a.jpg');
  assert.equal(safeImageUrl('https://cdn.x/a.jpg', ''), 'https://cdn.x/a.jpg');
  assert.equal(safeImageUrl("https://x/a.jpg');background:red", ''), null);
  assert.equal(safeImageUrl('javascript:alert(1)', ''), null);
  assert.equal(safeImageUrl(null, ''), null);
});
