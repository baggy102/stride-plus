import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kmSplits, kmTail, routeGeometry, haversineKm } from './route.ts';

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

// 북쪽으로 10 m마다 점을 찍은 직선(km 길이)
const north = (km) => Array.from({ length: Math.round(km * 100) + 1 }, (_, i) => [126.9, 37.5 + i * DEG_PER_KM / 100]);
const length = (pts) => pts.slice(1).reduce((v, p, i) => v + haversineKm(pts[i], p), 0);

test('routeGeometry — 내 러닝은 앞뒤 100 m를 점선 구간으로 나누고 km 점은 원래 출발점 기준', () => {
  const g = routeGeometry(north(2.5), true);
  assert.ok(Math.abs(length(g.head) - 0.1) < 0.002, `head ${length(g.head)}`);
  assert.ok(Math.abs(length(g.tail) - 0.1) < 0.002, `tail ${length(g.tail)}`);
  assert.ok(Math.abs(length(g.main) - 2.3) < 0.002, `main ${length(g.main)}`);
  assert.deepEqual(g.kms.map((k) => k.km), [1, 2]);
  assert.ok(Math.abs(haversineKm(north(2.5)[0], g.kms[0].at) - 1) < 0.002);
  assert.ok(Math.abs(g.kms[0].t - 0.9 / 2.3) < 0.002, `t ${g.kms[0].t}`);
});

test('routeGeometry — 남의 러닝(서버가 자름)은 전부 선이고 km은 100 m 밀려 있다', () => {
  const trimmed = north(2.3); // 원래 2.5 km에서 앞뒤 100 m가 빠진 경로
  const g = routeGeometry(trimmed, false);
  assert.equal(g.head.length, 0);
  assert.equal(g.tail.length, 0);
  assert.equal(g.main, trimmed);
  assert.deepEqual(g.kms.map((k) => k.km), [1, 2]);
  assert.ok(Math.abs(haversineKm(trimmed[0], g.kms[0].at) - 0.9) < 0.002);
});

test('routeGeometry — 200 m 이하 내 러닝은 나누지 않고, 1 km 미만이면 km 점이 없다', () => {
  const g = routeGeometry(north(0.15), true);
  assert.equal(g.head.length, 0);
  assert.equal(g.kms.length, 0);
  assert.equal(routeGeometry([[126.9, 37.5]], true).main.length, 1);
});

test('routeGeometry — 마지막 100 m 안의 km는 점을 찍지 않는다(2.05 km)', () => {
  assert.deepEqual(routeGeometry(north(2.05), true).kms.map((k) => k.km), [1]);
});
