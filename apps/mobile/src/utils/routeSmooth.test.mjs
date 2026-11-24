import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  smoothRoute, smoothGeometry, snapKmMarks, maxDeviationM, boxSmooth, metresPerPx, pointAtSource, valueAtSource, rawValueAt,
  locateOnRoute, flagRanges, MAP_SMOOTH,
} from './routeSmooth.ts';
import { routeGeometry, kmMarks, haversineKm } from './route.ts';

// 서울 근처 평면(m) ↔ 경위도
const O = [126.9, 37.55];
const KX = 111320 * Math.cos((O[1] * Math.PI) / 180);
const toLL = ([x, y]) => [O[0] + x / KX, O[1] + y / 110540];
const toXY = ([lng, lat]) => [(lng - O[0]) * KX, (lat - O[1]) * 110540];

// 고정 난수(같은 결과)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// 꼭짓점(m)을 따라 5 m마다 점, 정확도 흔들림 σ 약 2 m + 가끔 6 m 튐 — 기록(store/run.ts 5 m 간격)을 흉내 낸다
function gps(corners, seed = 7, sigma = 2) {
  const r = rng(seed);
  const gauss = () => (r() + r() + r() - 1.5) * 2 * sigma;
  const truth = [];
  for (let i = 1; i < corners.length; i++) {
    const [ax, ay] = corners[i - 1], [bx, by] = corners[i], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 5));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) truth.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  const raw = truth.map(([x, y], i) => {
    const spike = i % 37 === 11 ? 6 : 0;
    return toLL([x + gauss() + spike, y + gauss()]);
  });
  return { raw, truth: truth.map(toLL) };
}

// 동네 한 바퀴(약 2.6 km): 직각 모퉁이 · 대각선 · 150 m 되돌아 나오는 골목
const LOOP = [[0, 0], [400, 0], [400, 150], [400, 300], [550, 300], [400, 300], [250, 420], [0, 420], [0, 0]];

test('출발 점과 마지막 점(지금 위치)은 그대로', () => {
  const { raw } = gps(LOOP);
  const d = smoothRoute(raw);
  assert.deepEqual(d.pts[0], raw[0]);
  assert.deepEqual(d.pts[d.pts.length - 1], raw[raw.length - 1]);
  assert.equal(d.src[0], 0);
  assert.equal(d.src[d.src.length - 1], raw.length - 1);
});

test('모양은 그대로: 원래 점에서 8 m 안(가장 먼 곳은 흔들린 점이 바깥에 찍힌 직각 모퉁이), 참 경로에서 6 m 안, 참 경로에는 더 가까워지고 점은 크게 준다', () => {
  const { raw, truth } = gps(LOOP);
  const d = smoothRoute(raw);
  const devRaw = maxDeviationM(raw, d.pts);
  assert.ok(devRaw < 8, `원래 점에서 최대 ${devRaw.toFixed(2)} m`);
  const devTruth = maxDeviationM(truth, d.pts);
  assert.ok(devTruth < 6, `참 경로에서 최대 ${devTruth.toFixed(2)} m`);
  // 선의 점들이 참 경로에서 얼마나 떨어졌나(평균) — 흔들림이 줄어 원래 선보다 가깝다
  const mean = (line) => line.reduce((s, q) => s + maxDeviationM([q], truth), 0) / line.length;
  assert.ok(mean(d.pts) < mean(raw), `그린 선 ${mean(d.pts).toFixed(2)} m · 원래 선 ${mean(raw).toFixed(2)} m`);
  assert.ok(d.pts.length < raw.length * 0.6, `${raw.length} → ${d.pts.length}점`);
});

test('150 m 되돌아 나온 골목 끝이 지워지지 않는다', () => {
  const { raw } = gps(LOOP);
  const far = Math.max(...smoothRoute(raw).pts.map(toXY).map(([x]) => x));
  assert.ok(far > 540, `골목 끝 x=${far.toFixed(1)}`);
});

test('점이 듬성한 모퉁이(200 m 두 변)는 평균이 깎지 않는다', () => {
  const raw = [[0, 0], [200, 0], [200, 200]].map(toLL);
  const d = smoothRoute(raw);
  const dev = maxDeviationM(raw, d.pts);
  assert.ok(dev < MAP_SMOOTH.eps + MAP_SMOOTH.r1, `모퉁이에서 ${dev.toFixed(2)} m`);
});

test('src는 늘어나기만 하고 routeTimes를 그린 점에 맞춰 읽을 수 있다', () => {
  const { raw } = gps(LOOP);
  const times = raw.map((_, i) => i * 1.8);
  const d = smoothRoute(raw);
  for (let k = 1; k < d.src.length; k++) assert.ok(d.src[k] >= d.src[k - 1]);
  const t = d.src.map((u) => rawValueAt(times, u));
  for (let k = 1; k < t.length; k++) assert.ok(t[k] >= t[k - 1]);
  assert.equal(t[0], times[0]);
  assert.equal(t[t.length - 1], times[times.length - 1]);
  // 원래 번호 10번 점의 시각 = 그린 선에서 그 번호 자리의 시각
  assert.equal(rawValueAt(times, 10), times[10]);
});

test('기록 중 점이 늘어도 앞부분(지난 마디까지)은 그대로', () => {
  const { raw } = gps(LOOP);
  const a = smoothRoute(raw.slice(0, 300));
  const b = smoothRoute(raw.slice(0, 340));
  const stable = (d) => d.pts.filter((_, k) => d.src[k] < 192);
  assert.deepEqual(stable(a), stable(b));
});

test('경로 연출 RouteGeometry: 이음매 · km 수 · 위치 비율은 그대로, km 점은 그린 선 위로', () => {
  const { raw } = gps(LOOP, 3);
  const g = routeGeometry(raw, true);
  const s = smoothGeometry(g);
  assert.deepEqual(s.head[s.head.length - 1], s.main[0]);
  assert.deepEqual(s.main[s.main.length - 1], s.tail[0]);
  assert.deepEqual(s.kms.map((k) => [k.km, k.t]), g.kms.map((k) => [k.km, k.t]));
  s.kms.forEach((k, i) => {
    assert.ok(haversineKm(k.at, g.kms[i].at) * 1000 < 6, `${k.km} km 점이 ${(haversineKm(k.at, g.kms[i].at) * 1000).toFixed(1)} m 옮김`);
    assert.ok(maxDeviationM([k.at], s.main) < 0.01, '그린 선 위');
  });
});

test('km 눈금도 그린 선 위로(거리는 원래 경로 기준)', () => {
  const { raw } = gps(LOOP, 5);
  const d = smoothRoute(raw);
  const marks = kmMarks(raw);
  const snapped = snapKmMarks(raw, d, marks);
  assert.deepEqual(snapped.map((m) => m.km), marks.map((m) => m.km));
  snapped.forEach((m, i) => {
    assert.ok(haversineKm(m.at, marks[i].at) * 1000 < 6);
    assert.ok(maxDeviationM([m.at], d.pts) < 0.01);
  });
});

test('locateOnRoute: 선분 위 점의 소수 번호, 되돌아온 길에서도 앞 자리부터', () => {
  const r = [[0, 0], [100, 0], [0, 0]].map(toLL);
  const p = toLL([25, 0]);
  assert.ok(Math.abs(locateOnRoute(r, p) - 0.25) < 1e-6);
  assert.ok(Math.abs(locateOnRoute(r, p, 1) - 1.75) < 1e-6);
});

test('처음 달린 구간 표시 → 원래 번호 범위 → 그린 선 길이 범위', () => {
  assert.deepEqual(flagRanges([false, true, true, false, true]), [[1, 3], [4, 5]]);
  assert.deepEqual(flagRanges([]), []);
  const { raw } = gps(LOOP);
  const d = smoothRoute(raw);
  const cum = [0];
  for (let k = 1; k < d.pts.length; k++) cum.push(cum[k - 1] + haversineKm(d.pts[k - 1], d.pts[k]) * 1000);
  const [a, b] = [valueAtSource(cum, d.src, 100), valueAtSource(cum, d.src, 200)];
  assert.ok(a > 0 && b > a && b < cum[cum.length - 1]);
  // 범위 끝 점은 원래 100번 · 200번 점 근처
  assert.ok(haversineKm(pointAtSource(d.pts, d.src, 100), raw[100]) * 1000 < 6);
  assert.ok(haversineKm(pointAtSource(d.pts, d.src, 200), raw[200]) * 1000 < 6);
});

test('크기가 정해진 그림: 1 px이 몇 m인지에 맞춰 세지고, 지도값보다 약하지 않다', () => {
  const { raw } = gps(LOOP);
  const mpp = metresPerPx(raw, 360, 330, 44);
  assert.ok(mpp > 1.5 && mpp < 3, `mpp=${mpp}`);
  const o = boxSmooth(raw, 360, 330, 44);
  assert.equal(o.eps, Math.max(MAP_SMOOTH.eps, mpp));
  assert.equal(o.r1, Math.max(MAP_SMOOTH.r1, mpp * 6));
  const small = boxSmooth(raw, 44, 44, 8);
  assert.ok(small.eps > o.eps && small.r1 > o.r1);
});

test('점 0 · 1 · 2개는 그대로', () => {
  assert.deepEqual(smoothRoute([]), { pts: [], src: [] });
  const two = [[126.9, 37.5], [126.91, 37.5]];
  assert.deepEqual(smoothRoute(two), { pts: two, src: [0, 1] });
});
