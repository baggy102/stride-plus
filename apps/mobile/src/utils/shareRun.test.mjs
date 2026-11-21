import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstRunFlags, mostFrequent, evenPoints } from './shareRun.ts';

// 서울 근처에서 동쪽으로 곧게 가는 경로: 점 간격 약 50 m, n개
const BASE = [126.9, 37.55];
const M_PER_DEG_LNG = 111320 * Math.cos((37.55 * Math.PI) / 180);
const east = (n, northM = 0, startM = 0) =>
  Array.from({ length: n }, (_, i) => [BASE[0] + (startM + i * 50) / M_PER_DEG_LNG, BASE[1] + northM / 110540]);

test('이전 기록이 없으면 전부 처음 달린 길', () => {
  const r = east(21); // 1 km
  const { first, km } = firstRunFlags(r, []);
  assert.equal(first.length, 20);
  assert.ok(first.every(Boolean));
  assert.ok(Math.abs(km - 1) < 0.01, `km=${km}`);
});

test('같은 길을 다시 달리면 0 km', () => {
  const r = east(21);
  assert.equal(firstRunFlags(r, [east(21)]).km, 0);
});

test('옆으로 10 m 흔들린 같은 길도 처음이 아니다(이웃 칸 허용)', () => {
  assert.equal(firstRunFlags(east(21, 10), [east(21)]).km, 0);
});

test('절반만 새 길이면 절반 근처', () => {
  const r = east(41); // 2 km
  const prev = east(21); // 앞 1 km만 지난 적 있음
  const { km } = firstRunFlags(r, [prev]);
  assert.ok(km > 0.85 && km < 1.05, `km=${km}`);
});

test('점이 하나뿐인 경로는 구간이 없다', () => {
  assert.deepEqual(firstRunFlags([BASE], []), { first: [], km: 0 });
});

test('mostFrequent: 가장 많이 나온 동, 동률이면 먼저 나온 것, 빈 값 무시', () => {
  assert.equal(mostFrequent(['망원동', '합정동', '망원동', null]), '망원동');
  assert.equal(mostFrequent(['합정동', '망원동']), '합정동');
  assert.equal(mostFrequent([null, undefined, '']), null);
});

test('evenPoints: 양 끝 포함 고른 간격', () => {
  const r = east(11);
  const pts = evenPoints(r, 3);
  assert.deepEqual(pts, [r[0], r[5], r[10]]);
  assert.deepEqual(evenPoints([], 3), []);
  assert.deepEqual(evenPoints(r, 1), [r[5]]);
});
