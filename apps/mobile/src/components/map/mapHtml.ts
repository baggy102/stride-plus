import { withAlpha, type Palette } from '@/theme/colors';
import { LEAFLET_CSS, LEAFLET_JS, MARKERCLUSTER_CSS, MARKERCLUSTER_JS } from './webAssets.generated';

// 지도 WebView <head>에 넣을 라이브러리. CDN을 부르지 않고 앱 번들의 문자열을 인라인한다(D2)
export function leafletHead({ cluster }: { cluster: boolean }): string {
  const css = cluster ? LEAFLET_CSS + MARKERCLUSTER_CSS : LEAFLET_CSS;
  const js = cluster ? `${LEAFLET_JS}\n${MARKERCLUSTER_JS}` : LEAFLET_JS;
  return `<style>${css}</style>\n<script>${js}</script>`;
}

// 피드·프로필 지도가 같이 쓰는 러닝 마커(펄스 점)와 클러스터(+N) 아이콘. 전역 dotIcon·clusterIcon을 만든다
export function markerIconsScript(p: Palette): string {
  const m = p.map;
  return `
  var dotIcon=L.divIcon({html:'<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div class="run-dot-pulse" style="position:absolute;inset:0;border-radius:50%;background:${m.pulse}"></div><div style="width:11px;height:11px;border-radius:50%;background:${m.dot};border:2px solid ${m.dotBorder};box-shadow:0 0 8px ${withAlpha(m.dot, 0.7)}"></div></div>',className:'',iconSize:[22,22],iconAnchor:[11,11]});
  function clusterIcon(c){var n=c.getChildCount();return L.divIcon({html:'<div style="width:48px;height:48px;border-radius:50%;background:${m.clBg};color:${m.clRing};border:2px solid ${m.clRing};box-shadow:0 0 14px ${m.clGlow},0 0 4px ${withAlpha(m.clRing, 0.25)};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:-0.5px;font-family:system-ui">+'+n+'</div>',className:'',iconSize:[48,48],iconAnchor:[24,24]});}
`;
}

// 펄스 애니메이션 CSS(마커와 함께 쓴다)
export const MARKER_PULSE_CSS = `
    @keyframes runDotPulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(2.6); opacity: 0; }
    }
    .run-dot-pulse { animation: runDotPulse 2s ease-out infinite; }`;
