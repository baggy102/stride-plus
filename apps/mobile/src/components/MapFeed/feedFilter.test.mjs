import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HYPE_MIN_CHEERS, RUNNER_TONES, freshSegments, isHype, isOpener, matchesFilter, runnerTone, safeImageUrl } from './feedFilter.ts';

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

test('NEW 고른 경로의 새로 연 구간: 구간 가운데 점의 50 m 칸이 이 러닝이 연 칸일 때만 true', () => {
  const dLat = 50 / 111320, dLng = 50 / (111320 * Math.cos((37.5 * Math.PI) / 180));
  // 동서 직선 6점(약 40 m 간격). 앞 두 구간이 지나는 칸만 이 러닝이 열었다
  const main = Array.from({ length: 6 }, (_, i) => [127 + i * 0.00045, 37.50012]);
  const mid = (i) => [(main[i - 1][0] + main[i][0]) / 2, main[i][1]];
  const cellPoint = ([lng, lat]) => ({ lng: (Math.floor(lng / dLng) + 0.3) * dLng, lat: (Math.floor(lat / dLat) + 0.3) * dLat });
  const cells = [{ ...cellPoint(mid(1)), runId: 'r1' }, { ...cellPoint(mid(2)), runId: 'r1' }, { ...cellPoint(mid(4)), runId: 'r2' }];
  const m = freshSegments(main, cells, 'r1', 50);
  assert.equal(m.length, 5);
  assert.equal(m[0], true);
  assert.equal(m[1], true);
  assert.equal(m[3], false); // 다른 러닝이 연 칸
  assert.equal(freshSegments(main, cells, 'r3', 50), null); // 연 칸 없음
  assert.equal(freshSegments(main, [], 'r1', 50), null);
});
