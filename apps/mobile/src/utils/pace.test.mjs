import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPace, formatRunPace, MIN_PACE_DISTANCE_KM } from './pace.ts';

test('50 m 미만 기록은 페이스를 표시하지 않는다', () => {
  // 0.02 km를 39초에 → 1939초/km(32'19")가 나오던 경우
  assert.equal(formatRunPace(1939, 0.02), "--'--\"");
  assert.equal(formatRunPace(330, MIN_PACE_DISTANCE_KM), "5'30\"");
});

test('반올림해도 60초가 되지 않는다', () => {
  assert.equal(formatPace(359.6), "6'00\"");
});
