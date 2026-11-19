// node --test --experimental-strip-types 로 실행한다
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayLevel, monthGrid, monthRange } from './calendar.ts';

test('거리 단계 경계: 5 km · 10 km는 위 단계', () => {
  assert.equal(dayLevel(0.5), 0);
  assert.equal(dayLevel(4.99), 0);
  assert.equal(dayLevel(5), 1);
  assert.equal(dayLevel(9.99), 1);
  assert.equal(dayLevel(10), 2);
  assert.equal(dayLevel(42.2), 2);
});

test('2026년 11월: 1일이 일요일이라 앞에 빈 칸 6개, 30일까지', () => {
  const g = monthGrid(2026, 10);
  assert.equal(g.filter((d) => d === null).length, 6);
  assert.equal(g[6], 1);
  assert.equal(g[g.length - 1], 30);
});

test('월요일 1일이면 빈 칸 없음(2026년 6월)', () => {
  assert.equal(monthGrid(2026, 5)[0], 1);
});

test('달 범위는 다음 달 1일 0시까지, 12월은 해를 넘김', () => {
  const { from, to } = monthRange(2026, 11);
  assert.equal(new Date(from).getTime(), new Date(2026, 11, 1).getTime());
  assert.equal(new Date(to).getTime(), new Date(2027, 0, 1).getTime());
});
