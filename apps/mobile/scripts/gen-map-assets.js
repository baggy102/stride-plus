// 지도 WebView에 인라인할 라이브러리 JS·CSS를 문자열 모듈로 만든다(D2 — CDN 제거).
// 라이브러리 버전을 올리면 다시 실행한다: pnpm --filter @stride/mobile gen:map-assets
const fs = require('fs');
const path = require('path');

const dist = (pkg, file) => path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'dist', file);
const version = (pkg) => require(`${pkg}/package.json`).version;

// <script>·<style> 안에 그대로 넣으므로 닫는 태그로 오인될 수 있는 '</'를 끊고, 소스맵 주석은 뺀다
const read = (file) =>
  fs.readFileSync(file, 'utf8')
    .replace(/\/\/# sourceMappingURL=.*$/gm, '')
    .replace(/<\//g, '<\\/');

const assets = {
  LEAFLET_CSS: read(dist('leaflet', 'leaflet.css')),
  LEAFLET_JS: read(dist('leaflet', 'leaflet.js')),
  MARKERCLUSTER_CSS: read(dist('leaflet.markercluster', 'MarkerCluster.css')) + read(dist('leaflet.markercluster', 'MarkerCluster.Default.css')),
  MARKERCLUSTER_JS: read(dist('leaflet.markercluster', 'leaflet.markercluster.js')),
  PROTOMAPS_JS: read(dist('protomaps-leaflet', 'protomaps-leaflet.js')),
};

// 지도 색 기본값(D3). map/flavor.ts가 캔버스 지도 팔레트로 덮어쓴다
const { namedFlavor } = require('@protomaps/basemaps');
const flavors = { dark: namedFlavor('black'), light: namedFlavor('white') };

const header = [
  '// 자동 생성 파일 — 직접 고치지 말 것. scripts/gen-map-assets.js',
  `// leaflet ${version('leaflet')} · leaflet.markercluster ${version('leaflet.markercluster')}` +
    ` · protomaps-leaflet ${version('protomaps-leaflet')} · @protomaps/basemaps ${version('@protomaps/basemaps')}`,
  '',
].join('\n');

const body = Object.entries(assets)
  .map(([name, text]) => `export const ${name} = ${JSON.stringify(text)};`)
  .join('\n') +
  `\nexport const BASE_FLAVORS: Record<'dark' | 'light', Record<string, string>> = ${JSON.stringify(flavors)};`;

const out = path.join(__dirname, '..', 'src', 'components', 'map', 'webAssets.generated.ts');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${header}${body}\n`);
console.log(`${path.relative(process.cwd(), out)} ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
