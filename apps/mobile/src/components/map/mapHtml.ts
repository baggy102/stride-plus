import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { WebView } from 'react-native-webview';
import { withAlpha, type Palette } from '@/theme/colors';
import { MAP_TILE_URL } from '@/config/mapTiles';
import { mapFlavor } from './flavor';
import { LEAFLET_CSS, LEAFLET_JS, MARKERCLUSTER_CSS, MARKERCLUSTER_JS, PROTOMAPS_JS } from './webAssets.generated';

// 지도 WebView <head>에 넣을 라이브러리. CDN을 부르지 않고 앱 번들의 문자열을 인라인한다(D2)
export function leafletHead({ cluster }: { cluster: boolean }): string {
  const css = cluster ? LEAFLET_CSS + MARKERCLUSTER_CSS : LEAFLET_CSS;
  const js = [LEAFLET_JS, cluster ? MARKERCLUSTER_JS : '', PROTOMAPS_JS].join('\n');
  return `<style>${css}</style>\n<script>${js}</script>`;
}

// WebView 안에서 쓰는 지도 색(테마가 바뀌면 __setTheme으로 다시 넘긴다)
export function mapColors(p: Palette) {
  const m = p.map;
  return {
    bg: m.bg,
    pulse: m.pulse, dot: m.dot, dotBorder: m.dotBorder, dotGlow: withAlpha(m.dot, 0.7),
    clBg: m.clBg, clRing: m.clRing, clGlow: m.clGlow, clRingSoft: withAlpha(m.clRing, 0.25),
    meFill: m.meFill, meRing: m.meRing,
  };
}

// 피드·프로필 지도가 같이 쓰는 러닝 마커(펄스 점)와 클러스터(+N) 아이콘. 전역 dotIcon·clusterIcon과 makeIcons(c)를 만든다
export function markerIconsScript(p: Palette): string {
  return `
  var dotIcon, iconColors;
  function makeIcons(c){
    iconColors=c;
    dotIcon=L.divIcon({html:'<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div class="run-dot-pulse" style="position:absolute;inset:0;border-radius:50%;background:'+c.pulse+'"></div><div style="width:11px;height:11px;border-radius:50%;background:'+c.dot+';border:2px solid '+c.dotBorder+';box-shadow:0 0 8px '+c.dotGlow+'"></div></div>',className:'',iconSize:[22,22],iconAnchor:[11,11]});
  }
  function clusterIcon(cl){var c=iconColors,n=cl.getChildCount();return L.divIcon({html:'<div style="width:48px;height:48px;border-radius:50%;background:'+c.clBg+';color:'+c.clRing+';border:2px solid '+c.clRing+';box-shadow:0 0 14px '+c.clGlow+',0 0 4px '+c.clRingSoft+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:-0.5px;font-family:system-ui">+'+n+'</div>',className:'',iconSize:[48,48],iconAnchor:[24,24]});}
  makeIcons(${JSON.stringify(mapColors(p))});
`;
}

// 베이스맵(protomaps 벡터 타일, D3)과 테마 전환. 전역 map이 먼저 있어야 한다.
// __setTheme은 그리기 규칙만 바꿔 받아 둔 타일을 다시 그린다 — WebView 재로드·타일 재요청 없음.
// 화면별 색(마커·경로)은 각 HTML이 window.__onTheme(colors)로 갱신한다
export function baseMapScript(p: Palette, dark: boolean): string {
  return `
  function themeRules(f){return {paintRules:protomapsL.paintRules(f),labelRules:protomapsL.labelRules(f,'ko'),backgroundColor:f.background};}
  var baseLayer=protomapsL.leafletLayer(Object.assign({url:${JSON.stringify(MAP_TILE_URL)},lang:'ko'},themeRules(${JSON.stringify(mapFlavor(dark))})));
  // 출처 표기(Protomaps · OpenStreetMap)는 레이어가 직접 붙인다. 벡터 레이어는 maxZoom을 정하지 않아 클러스터용으로 지정
  baseLayer.addTo(map);
  map.setMaxZoom(18);
  window.__setTheme=function(f,c){
    var r=themeRules(f);
    baseLayer.paintRules=r.paintRules;baseLayer.labelRules=r.labelRules;baseLayer.backgroundColor=r.backgroundColor;
    baseLayer.clearLayout();baseLayer.rerenderTiles();
    document.body.style.background=c.bg;map.getContainer().style.background=c.bg;
    if(window.__onTheme)window.__onTheme(c);
  };
  map.getContainer().style.background=${JSON.stringify(p.map.bg)};
`;
}

// 펄스 애니메이션 CSS(마커와 함께 쓴다)
export const MARKER_PULSE_CSS = `
    @keyframes runDotPulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(2.6); opacity: 0; }
    }
    .run-dot-pulse { animation: runDotPulse 2s ease-out infinite; }`;

/**
 * 지도 HTML은 처음 테마로 한 번만 만들고, 이후 테마가 바뀌면 __setTheme만 주입한다(D3).
 * initial: HTML을 만들 때 쓸 처음 테마. applyTheme: WebView onLoadEnd에서도 불러 로드 중 바뀐 테마를 맞춘다
 */
export function useMapTheme(webViewRef: RefObject<WebView | null>, p: Palette, dark: boolean) {
  const initial = useRef({ p, dark }).current;
  const applyTheme = useCallback(() => {
    const args = `${JSON.stringify(mapFlavor(dark))},${JSON.stringify(mapColors(p))}`;
    webViewRef.current?.injectJavaScript(`window.__setTheme&&window.__setTheme(${args});true;`);
  }, [webViewRef, p, dark]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    applyTheme();
  }, [applyTheme]);

  return { initial, applyTheme };
}
