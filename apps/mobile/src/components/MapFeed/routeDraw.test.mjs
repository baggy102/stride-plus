import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeDraw } from './routeDraw.ts';

const route = (id, n = 3) => ({ id, coords: Array.from({ length: n }, (_, i) => [127 + i * 0.001, 37.5]) });

test('선택이 풀리면 받아 둔 경로가 남아 있어도 지운다(앞 경로를 끝 상태로 다시 그리지 않는다)', () => {
  assert.equal(routeDraw(null, null, route('a')), 'clear');
  assert.equal(routeDraw(undefined, null, null), 'clear');
});

test('카드를 닫기 시작하면 카드가 내려가기 전에 바로 지운다', () => {
  assert.equal(routeDraw('a', 'a', route('a')), 'clear');
  assert.equal(routeDraw('a', 'a', null), 'clear');
});

test('지난번에 닫은 러닝 표시는 새로 고른 러닝을 막지 않는다', () => {
  const r = route('b');
  assert.equal(routeDraw('b', 'a', r), r);
});

test('다른 마커로 바꾸면 새 경로를 받을 때까지 기다린다(앞 러닝의 경로를 새 색으로 다시 그리지 않는다)', () => {
  assert.equal(routeDraw('b', null, route('a')), 'wait');
  assert.equal(routeDraw('b', null, null), 'wait');
});

test('지금 고른 러닝의 경로면 받은 객체를 그대로 돌려준다', () => {
  const r = route('a');
  assert.equal(routeDraw('a', null, r), r);
});

test('그릴 선이 없으면(경로 없음 · 못 받음) 지운다', () => {
  assert.equal(routeDraw('a', null, route('a', 0)), 'clear');
  assert.equal(routeDraw('a', null, route('a', 1)), 'clear');
});
