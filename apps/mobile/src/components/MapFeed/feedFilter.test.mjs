import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HYPE_MIN_CHEERS, RUNNER_TONES, isHype, isOpener, matchesFilter, runnerTone, safeImageUrl } from './feedFilter.ts';

test('사용자 색 칸: 같은 id는 늘 같은 칸, 0~3, 여러 사람이면 여러 칸', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `6af57af9b13cd774468bc5${i.toString(16).padStart(2, '0')}`);
  for (const id of ids) {
    assert.equal(runnerTone(id), runnerTone(id));
    assert.ok(runnerTone(id) >= 0 && runnerTone(id) < RUNNER_TONES);
  }
  assert.equal(new Set(ids.map(runnerTone)).size, RUNNER_TONES);
});


test('HYPE는 응원 수가 기준 이상일 때만, 응원 수가 없으면 아니다', () => {
  assert.equal(isHype({ cheers: HYPE_MIN_CHEERS }), true);
  assert.equal(isHype({ cheers: HYPE_MIN_CHEERS - 1 }), false);
  assert.equal(isHype({}), false);
});

test('NEW는 이번 주 새 길을 연 러닝만(서버가 준 openers)', () => {
  const openers = new Set(['a']);
  assert.equal(isOpener({ _id: 'a' }, openers), true);
  assert.equal(isOpener({ _id: 'b' }, openers), false);
  assert.equal(isOpener({ _id: 'a' }, new Set()), false);
});

test('필터: TOTAL은 모두, HYPE·NEW는 각 기준', () => {
  const run = { _id: 'b', cheers: 5 };
  const openers = new Set(['a']);
  assert.equal(matchesFilter(run, 'total', openers), true);
  assert.equal(matchesFilter(run, 'hype', openers), true);
  assert.equal(matchesFilter(run, 'new', openers), false);
  assert.equal(matchesFilter({ _id: 'a', cheers: 0 }, 'new', openers), true);
});

test('이미지 주소: 상대 경로는 서버 주소를 붙이고, 위험한 문자는 버린다', () => {
  assert.equal(safeImageUrl('/uploads/a.jpg', 'http://10.0.0.2:3000'), 'http://10.0.0.2:3000/uploads/a.jpg');
  assert.equal(safeImageUrl('https://cdn.x/a.jpg', ''), 'https://cdn.x/a.jpg');
  assert.equal(safeImageUrl("https://x/a.jpg');background:red", ''), null);
  assert.equal(safeImageUrl('javascript:alert(1)', ''), null);
  assert.equal(safeImageUrl(null, ''), null);
});
