// node --test --experimental-strip-types 로 실행한다(package.json "test")
import test from 'node:test';
import assert from 'node:assert/strict';
import { elevationStyle, palettes } from './colors.ts';

test('라이트 그림자 = 0 8px 24px rgba(17,19,22,0.10)', () => {
  assert.deepEqual(elevationStyle(palettes.light), {
    shadowColor: '#111316', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  });
});

test('다크 그림자 = 0 10px 30px rgba(0,0,0,0.45)', () => {
  assert.deepEqual(elevationStyle(palettes.dark), {
    shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  });
});

test('라이트 헤더 알파는 디자인 값 0.92', () => {
  assert.equal(palettes.light.header, 'rgba(242,245,248,0.92)');
});

test('포인트 Signal Blue와 거리 단계 2단계는 같은 색(두 테마)', () => {
  for (const p of [palettes.dark, palettes.light]) {
    assert.equal(p.point, '#2E8BFF');
    assert.equal(p.onPoint, '#0B1016');
    assert.equal(p.level.length, 3);
    assert.equal(p.level[1], p.point);
  }
});
