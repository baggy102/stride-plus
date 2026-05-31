const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

let config = getDefaultConfig(projectRoot);

// pnpm 모노레포: Metro가 루트 node_modules까지 감시
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.unstable_enablePackageExports = false;

// NativeWind 캐시 디렉터리 보장
const nativewindCacheDir = path.join(projectRoot, 'node_modules', '.cache', 'nativewind');
if (!fs.existsSync(nativewindCacheDir)) {
  fs.mkdirSync(nativewindCacheDir, { recursive: true });
}

// withNativeWind 적용 후 getCSSForPlatform 제거
// Metro 0.81은 config를 worker로 IPC 직렬화할 때 structuredClone 사용 → 함수 불가
// getCSSForPlatform은 config.transformer.cssToReactNativeRuntime 안에 중첩됨
config = withNativeWind(config, { input: './global.css' });
delete config.getCSSForPlatform;
if (config.transformer?.cssToReactNativeRuntime) {
  delete config.transformer.cssToReactNativeRuntime.getCSSForPlatform;
}

module.exports = config;
