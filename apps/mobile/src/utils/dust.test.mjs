import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDust, dustPos, dustAlpha, STRIDE, KIND_TARGET, DUST_TIMELINE } from './dust.ts';

const dots = Array.from({ length: 120 }, (_, i) => [24 + i * 2.6, 140 + Math.sin(i / 9) * 60]);
const bars = [0, 1, 2, 3, 4].map((i) => ({ x: 24 + i * 66, y: 520 - (20 + i * 5), w: 60, h: 20 + i * 5 }));

test('막대 가루는 모두 막대 안에 내려앉는다', () => {
  const d = buildDust(dots, bars);
  const out = [0, 0, 0, 0];
  let landed = 0;
  for (let i = 0; i < d.count; i++) {
    if ((d.buf[i * STRIDE + 14] & KIND_TARGET) === 0) continue;
    dustPos(d.buf, i, DUST_TIMELINE, d.cx, d.cy, out);
    assert.equal(out[2], 1);
    const inside = bars.some((b) => out[0] >= b.x && out[0] <= b.x + b.w && out[1] >= b.y && out[1] <= b.y + b.h);
    assert.ok(inside, `가루 ${i}가 막대 밖 (${out[0]}, ${out[1]})`);
    landed++;
  }
  assert.ok(landed > 100);
});

test('같은 시드면 같은 배치, 가루 수 상한을 지킨다', () => {
  const a = buildDust(dots, bars);
  const b = buildDust(dots, bars);
  assert.deepEqual(a.buf, b.buf);
  const big = [{ x: 0, y: 400, w: 360, h: 44 }, { x: 0, y: 450, w: 360, h: 44 }];
  assert.ok(buildDust(dots, big).count <= 1500 + dots.length * 2);
});

test('t=0에서는 출발점 근처, 막대가 없으면 가루는 사라진다', () => {
  const d = buildDust(dots, []);
  const out = [0, 0, 0, 0];
  for (let i = 0; i < d.count; i++) {
    dustPos(d.buf, i, 0, d.cx, d.cy, out);
    assert.equal(out[2], 0);
    dustPos(d.buf, i, DUST_TIMELINE, d.cx, d.cy, out);
    assert.equal(dustAlpha(d.buf, i, out[2], out[3], 1), 0);
  }
});

test('점이 없으면 가루도 없다', () => {
  assert.equal(buildDust([], bars).count, 0);
});
