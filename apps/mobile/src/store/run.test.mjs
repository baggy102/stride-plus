import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// run.ts가 쓰는 네이티브 모듈(expo-location, react-native)을 가짜로 바꿔 끼운다.
// 가짜 동작은 globalThis.__loc / __appState에 두고 테스트마다 바꾼다.
const routeUrl = new URL('../utils/route.ts', import.meta.url).href;
const locationSrc = `
  const L = () => globalThis.__loc;
  export const Accuracy = { BestForNavigation: 6 };
  export const ActivityType = { Fitness: 3 };
  export const requestForegroundPermissionsAsync = (...a) => L().requestForegroundPermissionsAsync(...a);
  export const requestBackgroundPermissionsAsync = (...a) => L().requestBackgroundPermissionsAsync(...a);
  export const startLocationUpdatesAsync = (...a) => L().startLocationUpdatesAsync(...a);
  export const stopLocationUpdatesAsync = (...a) => L().stopLocationUpdatesAsync(...a);
  export const watchPositionAsync = (...a) => L().watchPositionAsync(...a);
`;
const rnSrc = `
  export const AppState = { addEventListener: (_e, fn) => { globalThis.__appState = fn; return { remove() {} }; } };
`;
const hooks = `
  const map = {
    'expo-location': 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(locationSrc)}),
    'react-native': 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(rnSrc)}),
    '@/utils/route': ${JSON.stringify(routeUrl)},
  };
  export async function resolve(specifier, context, next) {
    if (map[specifier]) return { url: map[specifier], shortCircuit: true };
    return next(specifier, context);
  }
`;
register('data:text/javascript,' + encodeURIComponent(hooks));

let calls;
function fakeLocation({ background = 'denied', startUpdates = 'ok' } = {}) {
  calls = [];
  globalThis.__loc = {
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestBackgroundPermissionsAsync: async () => { calls.push('askAlways'); return { status: background }; },
    startLocationUpdatesAsync: async () => {
      calls.push('startUpdates');
      if (startUpdates === 'fail') throw new Error('unavailable');
    },
    stopLocationUpdatesAsync: async () => { calls.push('stopUpdates'); },
    watchPositionAsync: async () => { calls.push('watch'); return { remove: () => calls.push('unwatch') }; },
  };
}

fakeLocation();
const { useRunStore } = await import('./run.ts');
const store = () => useRunStore.getState();

beforeEach(() => {
  if (store().isTracking) store().stopTracking();
  store().resetRun();
});

test('「사용하는 동안」 권한만 있어도 백그라운드 업데이트로 기록한다', async () => {
  fakeLocation({ background: 'denied' });
  await store().startTracking();
  assert.equal(store().trackingMode, 'background');
  assert.deepEqual(calls, ['askAlways', 'startUpdates']);
});

test('「항상」 권한이면 그대로 백그라운드로 기록한다', async () => {
  fakeLocation({ background: 'granted' });
  await store().startTracking();
  assert.equal(store().trackingMode, 'background');
});

test('「항상」 질문이 실패해도 백그라운드 업데이트를 시작한다', async () => {
  fakeLocation();
  globalThis.__loc.requestBackgroundPermissionsAsync = async () => { throw new Error('boom'); };
  await store().startTracking();
  assert.equal(store().trackingMode, 'background');
});

test('백그라운드 업데이트를 못 켜면(Expo Go 등) 포그라운드 구독으로 기록한다', async () => {
  fakeLocation({ startUpdates: 'fail' });
  await store().startTracking();
  assert.equal(store().trackingMode, 'foreground');
  assert.ok(calls.includes('watch'));
});

test('포그라운드로 기록 중 앱이 다시 보이면 백그라운드로 바꾸고 구독을 끈다', async () => {
  fakeLocation({ startUpdates: 'fail' });
  await store().startTracking();
  globalThis.__loc.startLocationUpdatesAsync = async () => { calls.push('startUpdates'); };
  calls.length = 0;
  globalThis.__appState('active');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(store().trackingMode, 'background');
  assert.deepEqual(calls, ['startUpdates', 'unwatch']);
});

test('백그라운드로 바꾸는 사이 기록이 끝나면 방금 켠 업데이트를 끈다', async () => {
  fakeLocation({ startUpdates: 'fail' });
  await store().startTracking();
  let release;
  globalThis.__loc.startLocationUpdatesAsync = () => new Promise((r) => { release = r; });
  const pending = store().upgradeToBackground();
  store().stopTracking();
  calls.length = 0;
  release();
  await pending;
  assert.equal(store().trackingMode, null);
  assert.deepEqual(calls, ['stopUpdates']);
});

test('백그라운드로 기록 중이면 앱이 다시 보여도 아무것도 하지 않는다', async () => {
  fakeLocation();
  await store().startTracking();
  calls.length = 0;
  globalThis.__appState('active');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, []);
});

test('종료하면 백그라운드 업데이트를 끈다', async () => {
  fakeLocation();
  await store().startTracking();
  calls.length = 0;
  store().stopTracking();
  assert.deepEqual(calls, ['stopUpdates']);
  assert.equal(store().isTracking, false);
});
