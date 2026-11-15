import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextWeakStreak, isGpsWeak } from './gpsSignal.ts';

const MAX = 30;
// 받은 위치 정확도들을 차례로 넣고 마지막 연속 버림 횟수를 돌려준다
const run = (accuracies) => accuracies.reduce((streak, a) => nextWeakStreak(streak, a, MAX), 0);

test('정확도 불량으로 버린 위치가 3번 연속이면 약함', () => {
  assert.equal(isGpsWeak(run([45, 60, 31])), true);
});

test('2번 연속까지는 약함이 아니다', () => {
  assert.equal(isGpsWeak(run([45, 60])), false);
});

test('좋은 위치 1번이면 바로 해제된다', () => {
  assert.equal(isGpsWeak(run([45, 60, 31, 50, 12])), false);
  assert.equal(run([45, 60, 31, 12]), 0);
});

test('중간에 좋은 위치가 끼면 처음부터 다시 센다', () => {
  assert.equal(isGpsWeak(run([45, 60, 10, 45, 60])), false);
});

test('기준값과 같으면 버리지 않으므로 세지 않는다', () => {
  assert.equal(run([30, 30, 30]), 0);
});

test('정확도를 모르는 위치(null)는 좋은 위치로 본다', () => {
  assert.equal(run([45, 60, null]), 0);
  assert.equal(run([45, 60, undefined]), 0);
});
