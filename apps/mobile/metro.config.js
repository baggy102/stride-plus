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
// (Metro 0.81 worker IPC로 함수 직렬화 불가 → "could not be cloned" 에러 방지)
config = withNativeWind(config, { input: './global.css' });
delete config.getCSSForPlatform;

module.exports = config;
