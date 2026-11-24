import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandStyles, evenStops, coreSteps, knockWidth, lineTone, lineLook, mixHex, solidBody, cumLen, pointAtLen, sliceLen, splitRanges, LINE_V2,
} from './routeLine.ts';
import { palettes } from '../theme/colors.ts';

test('띠: 8개, 출발 쪽이 옅고 지금 · 도착 쪽이 밝다, 빛은 한계(0.14 · 0.30 · 14 px)를 넘지 않는다', () => {
  const b = bandStyles(4);
  assert.equal(b.length, 8);
  assert.equal(b[0].t0, 0);
  assert.equal(b[7].t1, 1);
  for (let i = 1; i < b.length; i++) {
    assert.ok(b[i].bodyOp >= b[i - 1].bodyOp && b[i].innerOp >= b[i - 1].innerOp && b[i].outerOp >= b[i - 1].outerOp);
    assert.equal(b[i].t0, b[i - 1].t1);
  }
  assert.ok(b[0].bodyOp < 0.7 && b[0].bodyW < 4);
  assert.equal(b[7].bodyOp, 1);
  assert.equal(b[7].bodyW, 4);
  b.forEach((s) => {
    assert.ok(s.outerOp <= 0.14 + 1e-9 && s.innerOp <= 0.3 + 1e-9);
    assert.ok(s.outerW <= 14 && s.innerW === 4 * 2.4);
  });
  assert.equal(knockWidth(4), 4 * 2.4 + 3);
});

test('일시정지는 빛이 약하다 · 띠 경계를 바꿀 수 있다', () => {
  const p = bandStyles(4, { paused: true });
  assert.ok(p[7].outerOp <= 0.06 + 1e-9 && p[7].innerOp <= 0.16 + 1e-9);
  const s = bandStyles(3, { stops: [0, 0.1, 0.9, 1] });
  assert.equal(s.length, 3);
  assert.deepEqual(evenStops(4), [0, 0.25, 0.5, 0.75, 1]);
});

test('속선: 머리 쪽으로 0.15 → 0.85', () => {
  const c = coreSteps();
  assert.equal(c.length, LINE_V2.core.steps);
  assert.equal(c[0].f0, 0);
  assert.equal(c[c.length - 1].f1, 1);
  assert.ok(Math.abs(c[c.length - 1].op - 0.85) < 1e-9);
});

test('선 색: Ice는 바깥 빛만 Signal Blue, 민트 · Pearl은 제 색, 다크에서 흰색 없음', () => {
  const d = palettes.dark;
  const ice = lineTone(d);
  assert.deepEqual([ice.body, ice.outer, ice.core, ice.head], [d.map.dot, d.point, d.text, d.text]);
  const mint = lineTone(d, d.fresh);
  assert.deepEqual([mint.body, mint.outer], [d.fresh, d.fresh]);
  const hype = lineTone(d, d.hype);
  assert.deepEqual([hype.body, hype.core, hype.head], [d.hype, d.hype, d.hype]);
  [ice, mint, hype].forEach((t) => assert.ok(!Object.values(t).includes('#FFFFFF')));
  assert.equal(lineTone(palettes.light).head, palettes.light.map.dot);
});

test('이음매 없는 선 몸: 바탕 위 반투명 쌓기와 같은 불투명 색, 출발 쪽이 더 어둡다', () => {
  assert.equal(mixHex('#FFFFFF', '#000000', 0.5), '#808080');
  assert.equal(mixHex('#9DBFE0', '#16202B', 1), '#9DBFE0');
  const d = palettes.dark;
  const look = lineLook(d);
  assert.equal(look.bodies.length, 8);
  assert.equal(look.bodies[7], solidBody(lineTone(d), d.map.bg, bandStyles(1)[7]));
  const lum = (h) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  assert.ok(lum(look.bodies[0]) < lum(look.bodies[7]));
  assert.equal(look.cores.length, 6);
  assert.ok(lum(look.cores[5]) > lum(look.cores[0]));
});

test('길이 도구: 지점 · 구간(양 끝 보간) · 범위 나누기', () => {
  const ps = [[0, 0], [10, 0], [10, 10]];
  const c = cumLen(ps);
  assert.deepEqual(c, [0, 10, 20]);
  assert.deepEqual(pointAtLen(ps, c, 15), [10, 5]);
  assert.deepEqual(sliceLen(ps, c, 5, 15), [[5, 0], [10, 0], [10, 5]]);
  assert.deepEqual(sliceLen(ps, c, 0, 20), [[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(splitRanges(0, 10, [[2, 4], [6, 12]]), { inside: [[2, 4], [6, 10]], outside: [[0, 2], [4, 6]] });
  assert.deepEqual(splitRanges(0, 10, []), { inside: [], outside: [[0, 10]] });
});
