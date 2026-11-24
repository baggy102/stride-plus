import { useCallback, useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import type { WebView } from 'react-native-webview';
import { withAlpha, type Palette } from '@/theme/colors';
import { MAP_TILE_URL } from '@/config/mapTiles';
import { lineLook } from '@/utils/routeLine';
import { mapFlavor } from './flavor';
import { LEAFLET_CSS, LEAFLET_JS, MARKERCLUSTER_CSS, MARKERCLUSTER_JS, PROTOMAPS_JS } from './webAssets.generated';

// WebView ref 타입(react-native-webview 14부터 함수 컴포넌트라 클래스 이름을 타입으로 쓸 수 없다)
export type WebViewHandle = ComponentRef<typeof WebView>;

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
    meFill: m.meFill, meRing: m.meRing, meHalo: m.meHalo,
    // Frost: 유리 클러스터·링 마커·선택 경로
    glass: p.glass, glassBorder: p.glassBorder, text: p.text, ring: p.bg,
    // 지도 피드 얼굴 마커: 이니셜 바탕 · HYPE(Pearl)·NEW(민트)와 그 번짐
    face: p.surface2, faceText: p.text2,
    hype: p.hype, hypeSoft: withAlpha(p.hype, 0.22), hypeGlow: withAlpha(p.hype, 0.45),
    fresh: p.fresh, onSocial: p.onSocial,
    runners: m.runners, operator: m.operator, onOperator: m.onOperator,
    dark: p.dark,
    // 경로 선 v2 색 한 벌(기록 · 요약 · 상세 지도)
    line: lineLook(p),
  };
}

// 피드·프로필 지도가 같이 쓰는 마커와 묶음 아이콘. 전역 dotIcon·face·stackPill과 makeIcons(c)를 만든다.
// dotIcon: 펄스 점(이전 디자인, 44px 터치 영역). face: 얼굴 링, stackPill: 묶음 — 지도 피드(MapFeed)와 내 흔적(ProfileMapScreen)이 같이 쓴다.
export function markerIconsScript(p: Palette): string {
  return `
  var dotIcon, iconColors;
  function makeIcons(c){
    iconColors=c;
    dotIcon=L.divIcon({html:'<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div class="run-dot-pulse" style="position:absolute;inset:0;border-radius:50%;background:'+c.pulse+'"></div><div style="width:11px;height:11px;border-radius:50%;background:'+c.dot+';border:2px solid '+c.dotBorder+';box-shadow:0 0 8px '+c.dotGlow+'"></div></div>',className:'',iconSize:[22,22],iconAnchor:[11,11]});
  }
  // 얼굴(지도 피드 · 내 흔적 마커 공용): 이니셜을 깔고 사진을 덮는다(사진을 못 받아도 이니셜이 보인다)
  function esc(s){return String(s).replace(/[&<>"']/g,function(ch){return '&#'+ch.charCodeAt(0)+';';});}
  function face(run,size,ring,ringW){
    var c=iconColors;
    var img=run.avatar?'<div style="position:absolute;inset:0;background:url('+run.avatar+') center/cover"></div>':'';
    return '<div style="position:relative;width:'+size+'px;height:'+size+'px;box-sizing:border-box;border-radius:50%;border:'+ringW+'px solid '+ring+';background:'+c.face+';overflow:hidden;display:flex;align-items:center;justify-content:center;font:600 '+Math.round(size*0.38)+'px/1 -apple-system,system-ui,sans-serif;color:'+c.faceText+'">'+esc(run.initial)+img+'</div>';
  }
  // 묶음: 유리 알약 안에 얼굴 겹침(faces, count개) + 수. on이 아니면 흐리게
  function stackPill(faces,count,n,on){
    var c=iconColors,w=Math.round(8+28+18*(count-1)+14+n.length*7.5);
    return L.divIcon({html:'<div class="face-in"><div style="display:inline-flex;align-items:center;padding:3px;border-radius:99px;background:'+c.glass+';border:1px solid '+c.glassBorder+';-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 8px 24px rgba(0,0,0,'+(c.dark?0.45:0.12)+');opacity:'+(on?1:0.45)+';filter:'+(on?'none':'grayscale(1)')+'">'+faces+'<div style="padding:0 8px 0 6px;font:500 12px/1 ui-monospace,Menlo,monospace;color:'+c.text+'">'+n+'</div></div></div>',className:'',iconSize:[w,36],iconAnchor:[w/2,18]});
  }
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
  // 출처 표기(Protomaps · OpenStreetMap)는 레이어가 직접 붙인다. OSM 표기는 지워선 안 되므로 작게 왼쪽 아래(축척 위)로 옮기고
  // Leaflet 접두어(깃발·Leaflet)는 뺀다 — 오른쪽 아래 현 위치 버튼과 겹치지 않게
  baseLayer.addTo(map);
  if(map.attributionControl){map.attributionControl.setPrefix(false);map.attributionControl.setPosition('bottomleft');}
  (function(){var s=document.createElement('style');s.textContent='.leaflet-control-attribution{font-size:9px!important;line-height:12px!important;padding:0 4px!important;background:transparent!important;opacity:.55;margin-left:14px!important}.leaflet-control-attribution a{color:inherit!important;text-decoration:none!important}';document.head.appendChild(s);})();
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
export function useMapTheme(webViewRef: RefObject<WebViewHandle | null>, p: Palette, dark: boolean) {
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
