import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kmSplits, kmTail } from './route.ts';

// 북쪽으로 10 m마다 한 점, 10 m에 3.3초(5'30"/km)
const DEG_PER_KM = 1 / 111.19492664455873;
function straight(km) {
  const n = Math.round(km * 100);
  const coords = Array.from({ length: n + 1 }, (_, i) => [126.9, 37.5 + i * 0.01 * DEG_PER_KM]);
  const times = coords.map((_, i) => i * 3.3);
  return { coords, times };
}

test('1 km 미만도 자투리 하나가 남는다', () => {
  const { coords, times } = straight(0.84);
  assert.deepEqual(kmSplits(coords, times), []);
  const tail = kmTail(coords, times);
  assert.ok(tail);
  assert.ok(Math.abs(tail.km - 0.84) < 0.001, `km ${tail.km}`);
  assert.ok(Math.abs(tail.sec - 0.84 * 330) < 1, `sec ${tail.sec}`);
});

test('3.1 km = 다 채운 3 km + 0.1 km 자투리', () => {
  const { coords, times } = straight(3.1);
  assert.equal(kmSplits(coords, times).length, 3);
  const tail = kmTail(coords, times);
  assert.ok(Math.abs(tail.km - 0.1) < 0.001, `km ${tail.km}`);
  assert.ok(Math.abs(tail.sec - 33) < 1, `sec ${tail.sec}`);
});

test('0.04 km 미만 자투리나 시간이 없는 기록은 null', () => {
  const { coords, times } = straight(2.02);
  assert.equal(kmTail(coords, times), null);
  assert.equal(kmTail(coords, undefined), null);
  assert.equal(kmTail(coords.slice(0, 1), times.slice(0, 1)), null);
});

test('순간 튐 구간은 자투리 거리에서도 뺀다', () => {
  const { coords, times } = straight(0.5);
  // 마지막 점을 1 km 밖으로 튀게(1초에 1 km)
  coords.push([126.9, coords[coords.length - 1][1] + DEG_PER_KM]);
  times.push(times[times.length - 1] + 1);
  const tail = kmTail(coords, times);
  assert.ok(Math.abs(tail.km - 0.5) < 0.001, `km ${tail.km}`);
});
