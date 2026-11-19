import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDust, dustPos, dustAlpha, dotKm, dustTotal, freezeAt, STRIDE, KIND_TARGET } from './dust.ts';

// 버퍼 안 위치(dust.ts와 같다)
const X0 = 0, Y0 = 1, TX = 4, TY = 5, KIND = 11;

const dots = Array.from({ length: 120 }, (_, i) => [24 + i * 2.6, 140 + Math.sin(i / 9) * 60]);
const bars = [0, 1, 2, 3, 4].map((i) => ({ x: 24 + i * 66, y: 520 - (20 + i * 5), w: 60, h: 20 + i * 5 }));
const isTarget = (d, i) => (d.buf[i * STRIDE + KIND] & KIND_TARGET) !== 0;
const barOf = (bs, x, y) => bs.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);

test('막대 가루는 모두 자기 막대 안에 내려앉고, 막대가 얼면 사라진다', () => {
  const d = buildDust(dots, bars, 5);
  const end = dustTotal(bars.length);
  const out = [0, 0, 0, 0];
  let landed = 0;
  for (let i = 0; i < d.count; i++) {
    if (!isTarget(d, i)) continue;
    dustPos(d.buf, i, end, d.cx, d.cy, out);
    assert.equal(out[2], 1);
    const bar = barOf(bars, d.buf[i * STRIDE + TX], d.buf[i * STRIDE + TY]);
    assert.equal(barOf(bars, out[0], out[1]), bar, `가루 ${i}가 막대 밖 (${out[0]}, ${out[1]})`);
    assert.equal(dustAlpha(d.buf, i, out[2], out[3]), 0);
    landed++;
  }
  assert.ok(landed > 100);
});

test('같은 입력이면 같은 배치, 가루 수 상한을 지킨다', () => {
  const a = buildDust(dots, bars, 5);
  const b = buildDust(dots, bars, 5);
  assert.deepEqual(a.buf, b.buf);
  const big = [{ x: 0, y: 400, w: 360, h: 44 }, { x: 0, y: 450, w: 360, h: 44 }];
  const d = buildDust(dots, big, 2);
  let targets = 0;
  for (let i = 0; i < d.count; i++) if (isTarget(d, i)) targets++;
  assert.ok(targets <= 1500, `막대 가루 ${targets}`);
});

test('짧은 경로는 가루도 적다: 점 × 7(최소 220)', () => {
  const few = dots.slice(0, 30);
  const one = [{ x: 24, y: 490, w: 61, h: 30 }];
  const d = buildDust(few, one, 0.84);
  let targets = 0;
  for (let i = 0; i < d.count; i++) if (isTarget(d, i)) targets++;
  assert.ok(targets >= 220 * 0.8 && targets <= 220 * 1.2, `막대 가루 ${targets}`);
  // 남는 가루는 점 하나에 많아야 한 알
  assert.ok(d.count - targets <= few.length);
});

test('k번째 막대의 가루는 k번째 km의 점에서 출발한다', () => {
  // 12px 간격 일직선 30점 = 3 km(10점씩). 출발 흩어짐은 가로 5px 이내라 가장 가까운 점이 출발 점이다
  const line = Array.from({ length: 30 }, (_, i) => [20 + i * 12, 200]);
  const three = [0, 1, 2].map((i) => ({ x: 24 + i * 66, y: 480, w: 60, h: 30 }));
  const km = dotKm(line, 3, 3);
  assert.deepEqual([km[0], km[9], km[10], km[19], km[20], km[29]], [0, 0, 1, 1, 2, 2]);
  const d = buildDust(line, three, 3);
  for (let i = 0; i < d.count; i++) {
    if (!isTarget(d, i)) continue;
    const bar = barOf(three, d.buf[i * STRIDE + TX], d.buf[i * STRIDE + TY]);
    const x = d.buf[i * STRIDE + X0], y = d.buf[i * STRIDE + Y0];
    const from = Math.round((x - 20) / 12);
    assert.ok(Math.abs(y - 200) <= 5.01 && km[from] === bar, `가루 ${i}: 막대 ${bar}, 출발 (${x}, ${y})`);
  }
});

test('0.84 km(자투리 막대 하나)에도 가루가 막대로 간다', () => {
  const one = [{ x: 24, y: 490, w: 51, h: 30 }];
  const d = buildDust(dots, one, 0.84);
  let targets = 0;
  for (let i = 0; i < d.count; i++) if (isTarget(d, i)) targets++;
  assert.ok(targets > 0);
  assert.ok(freezeAt(0, 1) < dustTotal(1));
});

test('막대가 없으면 가루는 금 간 뒤 녹아 사라진다', () => {
  const d = buildDust(dots, [], 0);
  const out = [0, 0, 0, 0];
  for (let i = 0; i < d.count; i++) {
    dustPos(d.buf, i, 0, d.cx, d.cy, out);
    assert.equal(out[2], 0);
    assert.ok(out[3] > 0);
    dustPos(d.buf, i, 800, d.cx, d.cy, out);
    assert.equal(dustAlpha(d.buf, i, out[2], out[3]), 0);
  }
});

test('점이 없으면 가루도 없다', () => {
  assert.equal(buildDust([], bars, 5).count, 0);
});
