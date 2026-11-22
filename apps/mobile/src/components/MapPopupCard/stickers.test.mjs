import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posterStickers, STICKER_LABEL } from './stickers.ts';

// 기기 시간대 기준으로 만든 시각(테스트가 어느 시간대에서 돌아도 같다)
const at = (h, m = 0, dayOffset = 0) => new Date(2026, 10, 19 + dayOffset, h, m).getTime();
const run = (startHour, km, uploadedDayOffset = 0) => {
  const pace = 330;
  const uploaded = at(startHour, 0, uploadedDayOffset) + pace * km * 1000;
  return { createdAt: new Date(uploaded).toISOString(), distanceKm: km, paceSecPerKm: pace };
};
const NOW = at(12);

test('새벽 5시 출발 10 km, 오늘 올림 → 새벽 러닝 · 10K+ (NEW는 3번째라 빠짐)', () => {
  assert.deepEqual(posterStickers(run(5, 10.2), NOW), ['dawn', 'tenK']);
});

test('저녁 5 km, 오늘 → NEW만', () => {
  assert.deepEqual(posterStickers(run(19, 5, -1), at(12)), ['new']);
});

test('출발 기준으로 본다: 7시 50분 출발해 8시 넘어 올려도 새벽 러닝', () => {
  const pace = 330, km = 3;
  const start = at(7, 50, -3);
  const r = { createdAt: new Date(start + pace * km * 1000).toISOString(), distanceKm: km, paceSecPerKm: pace };
  assert.deepEqual(posterStickers(r, NOW), ['dawn']);
});

test('오래된 낮 러닝은 스티커 없음, 날짜가 잘못되면 거리만 본다', () => {
  assert.deepEqual(posterStickers(run(14, 4, -5), NOW), []);
  assert.deepEqual(posterStickers({ createdAt: 'x', distanceKm: 12, paceSecPerKm: 300 }, NOW), ['tenK']);
});

test('24시간 안 스티커는 「오늘」이라고 쓴다(지도 피드 NEW와 다른 말)', () => {
  assert.equal(STICKER_LABEL.new, '오늘');
});

test('새벽 스티커는 「러닝」으로 쓴다(앱 표준 단어, 「런」 없음)', () => {
  assert.equal(STICKER_LABEL.dawn, '새벽 러닝');
});
