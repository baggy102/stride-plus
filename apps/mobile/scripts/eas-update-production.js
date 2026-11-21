// 운영 앱(TestFlight·스토어 빌드)에 OTA 업데이트 올리기: node scripts/eas-update-production.js "메시지"
// - 업데이트 번들과 앱 설정(extra.apiUrl 등)은 이 PC에서 만들어진다. .env.local(로컬 서버 IP · 개발 타일)이 섞이면 운영 사용자가
//   로컬 서버를 보게 되므로 .env 파일을 읽지 않고(EXPO_NO_DOTENV), 운영 빌드와 같은 값만 넣는다:
//   eas.json build.production.env(API 주소) + EAS 서버의 production 환경 변수(지도 타일 — 빌드도 이것을 쓴다, --environment production).
// - 네이티브가 바뀐 변경(패키지 추가·권한·플러그인·SDK)은 업데이트로 보내면 안 된다 → app.json version을 올리고 빌드한다(runtimeVersion = appVersion).
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const eas = require(path.join(__dirname, '..', 'eas.json'));

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('사용: node scripts/eas-update-production.js "업데이트 메시지"');
  process.exit(1);
}
const env = { ...process.env, ...eas.build.production.env, EXPO_NO_DOTENV: '1' };
// 지도 타일은 EAS production 환경 변수에서 받는다(운영 빌드와 같은 값). 로컬 셸에 남은 값은 빼서 섞이지 않게 한다
delete env.EXPO_PUBLIC_MAP_TILE_URL;
console.log(`운영 업데이트: channel=production · environment=production(EAS) · API=${env.EXPO_PUBLIC_API_URL}`);
const r = spawnSync('npx', ['-y', 'eas-cli@latest', 'update', '--channel', 'production', '--environment', 'production', '--platform', 'ios', '--message', JSON.stringify(message.replace(/"/g, "'"))], {
  cwd: path.join(__dirname, '..'), env, stdio: 'inherit', shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
