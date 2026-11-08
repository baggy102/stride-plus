import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useColors, useScheme } from '@/theme/useColors';
import type { Palette } from '@/theme/colors';
import { baseMapScript, leafletHead, useMapTheme, type WebViewHandle } from '@/components/map/mapHtml';
import { kmMarks } from '@/utils/route';

// 경로를 실제 지도 위 좌표에 그린다. 기록 중(따라가기·손으로 이동)·요약·상세(경로 맞춤)에서 쓴다.
// 좌표는 GeoJSON [lng, lat]. HTML은 테마가 바뀔 때만 다시 만들고, 경로는 __setRoute로만 갱신한다.
export interface RouteMapHandle {
  /** 따라가기를 다시 켜고 지금 위치(요약·상세는 경로 전체)로 */
  recenter: () => void;
  /** 경로 점들의 지도 화면 좌표(지도 왼쪽 위 기준 px). 종료 가루 전환의 출발점 */
  projectRoute: () => Promise<[number, number][]>;
}

interface Props {
  coordinates: [number, number][];
  /** 경로가 없을 때 가운데에 둘 위치 [lng, lat] */
  fallbackCenter?: [number, number];
  /** 마지막 좌표를 「지금 위치」 점으로 표시 */
  showCurrent?: boolean;
  /** 경로 전체가 보이게 맞출지(요약·상세), 마지막 위치를 따라갈지(기록 중) */
  fit?: 'route' | 'follow';
  /** 1 km마다 경로 바깥쪽으로 눈금 + 「1K」 라벨(Frost S10) */
  kmTicks?: boolean;
  /** 손으로 움직이고 확대할 수 있게(기록 중). 끌면 따라가기를 멈추고 recenter로 다시 켠다 */
  interactive?: boolean;
  /** 형광펜처럼 두껍고 반투명한 선(기록 중) */
  highlighter?: boolean;
  /** GPS 점마다 얼음빛 점 구름을 형광펜 위에 찍고, 지도 타일은 한 톤 누른다 */
  cloud?: boolean;
  style?: ViewStyle;
}

function buildHtml(p: Palette, dark: boolean, interactive: boolean, highlighter: boolean, cloud: boolean) {
  const m = p.map;
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  ${leafletHead({ cluster: false })}
  <style>
    * { margin:0; padding:0; }
    html, body, #map { width:100%; height:100%; background:${m.bg}; }
    .leaflet-control-attribution { font-size: 9px !important; background: transparent !important; color: ${p.text2} !important; }
    .leaflet-control-attribution a { color: ${p.text2} !important; }
    :root { --tick: ${p.text}; --halo: ${m.bg}; }
    ${cloud ? '.leaflet-tile-pane { opacity: 0.72; }' : ''}
    #cloud { position:absolute; left:0; top:0; pointer-events:none; z-index:450; }
    .leaflet-zoom-anim #cloud { visibility:hidden; }
    .km-tick { font: 500 11px/14px ui-monospace, Menlo, monospace; letter-spacing: 0.04em; text-align: center; color: var(--tick);
      text-shadow: 0 0 2px var(--halo), 1px 1px 0 var(--halo), -1px -1px 0 var(--halo), 1px -1px 0 var(--halo), -1px 1px 0 var(--halo); }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', ${interactive
    ? "{ zoomControl:false }"
    : "{ zoomControl:false, dragging:false, touchZoom:false, doubleClickZoom:false, scrollWheelZoom:false, boxZoom:false, keyboard:false, tap:false }"});
${baseMapScript(p, dark)}
  // 기록 중: 형광펜(굵고 반투명, 끝이 둥근 선). 요약·상세: 얇은 선 + 다크에서만 은은한 빛
  var HL = ${highlighter};
  var CLOUD = ${cloud};
  var glow = L.polyline([], { color:'${m.dot}', weight:HL ? (CLOUD && !${interactive} ? 14 : 16) : 7.5, opacity:HL ? 0.22 : ${p.dark ? 0.35 : 0}, lineCap:'round', lineJoin:'round' }).addTo(map);
  var line = L.polyline([], { color:'${m.dot}', weight:HL ? (CLOUD && !${interactive} ? 8 : 9) : 3.5, opacity:HL ? 0.55 : 1, lineCap:'round', lineJoin:'round' }).addTo(map);
  // 손으로 지도를 끌면 따라가기를 멈춘다(현 위치 버튼으로 다시 켠다)
  var following = true;
  map.on('dragstart', function(){ following = false; });
  var ticks = L.layerGroup().addTo(map);
  var marks = [];
  var tickColor = '${p.text}';
  var markerPane = CLOUD ? map.createPane('above') : null;
  if (markerPane) markerPane.style.zIndex = 460;
  var start = L.circleMarker([0,0], { pane: CLOUD ? 'above' : 'overlayPane', radius:4.5, color:'${m.dot}', weight:2, fillColor:'${m.bg}', fillOpacity:1 });
  var me = L.circleMarker([0,0], { pane: CLOUD ? 'above' : 'overlayPane', radius:7, color:'${m.meRing}', weight:3, fillColor:'${m.meFill}', fillOpacity:1 });
  var end = L.circleMarker([0,0], { pane: CLOUD ? 'above' : 'overlayPane', radius:5.5, color:'${m.dotBorder}', weight:2, fillColor:'${m.dot}', fillOpacity:1 });
  var mode = 'follow';
  // 점 구름: 지도 위 캔버스. 화면에서 5px보다 가까운 점은 건너뛰어 확대·축소해도 밀도가 같고, 오래된 점일수록 옅다
  var cloudColor = '${m.dot}';
  var cv = null, cx = null;
  if (CLOUD) {
    cv = document.createElement('canvas'); cv.id = 'cloud';
    map.getContainer().appendChild(cv); cx = cv.getContext('2d');
  }
  function rgb(hex){ var h = hex.replace('#',''); if (h.length === 3) h = h.split('').map(function(x){ return x + x; }).join('');
    var n = parseInt(h.slice(0,6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); }
  function jit(i, k){ var x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return (x - Math.floor(x) - 0.5) * 2.4; }
  function drawCloud(){
    if (!cx) return;
    var size = map.getSize(), dpr = window.devicePixelRatio || 1;
    if (cv.width !== size.x * dpr || cv.height !== size.y * dpr) {
      cv.width = size.x * dpr; cv.height = size.y * dpr; cv.style.width = size.x + 'px'; cv.style.height = size.y + 'px';
    }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, size.x, size.y);
    var pts = line.getLatLngs(), n = pts.length, last = null, c = rgb(cloudColor);
    for (var i = 0; i < n; i++) {
      var q = map.latLngToContainerPoint(pts[i]);
      if (last && i !== n - 1 && Math.abs(q.x - last.x) + Math.abs(q.y - last.y) < 5) continue;
      last = q;
      if (q.x < -8 || q.y < -8 || q.x > size.x + 8 || q.y > size.y + 8) continue;
      var a = 0.35 + 0.65 * (i / n), x = q.x + jit(i, 1), y = q.y + jit(i, 2);
      cx.fillStyle = 'rgba(' + c + ',' + (0.18 * a) + ')'; cx.beginPath(); cx.arc(x, y, 3.6, 0, 7); cx.fill();
      cx.fillStyle = 'rgba(' + c + ',' + (0.95 * a) + ')'; cx.beginPath(); cx.arc(x, y, 1.4, 0, 7); cx.fill();
    }
  }
  if (CLOUD) map.on('move zoom zoomend viewreset resize', drawCloud);
  window.__onTheme = function(c){
    glow.setStyle({ color:c.dot, opacity:HL ? 0.22 : (c.dark ? 0.35 : 0) });
    line.setStyle({ color:c.dot });
    cloudColor = c.dot; drawCloud();
    tickColor = c.text;
    document.documentElement.style.setProperty('--tick', c.text);
    document.documentElement.style.setProperty('--halo', c.bg);
    drawTicks();
    start.setStyle({ color:c.dot, fillColor:c.bg });
    me.setStyle({ color:c.meRing, fillColor:c.meFill });
    end.setStyle({ color:c.dotBorder, fillColor:c.dot });
  };
  function toLatLng(c){ return [c[1], c[0]]; }
  // km 눈금: 화면 좌표에서 진행 방향의 수직, 경로 가운데 반대쪽(바깥)으로 ±5px 선 + 16px 밖 라벨
  function drawTicks(){
    ticks.clearLayers();
    if (!marks.length || line.getLatLngs().length < 2) return;
    var center = map.latLngToLayerPoint(line.getBounds().getCenter());
    marks.forEach(function(m){
      var p = map.latLngToLayerPoint(toLatLng(m.at)), a = map.latLngToLayerPoint(toLatLng(m.from)), b = map.latLngToLayerPoint(toLatLng(m.to));
      var nx = -(b.y - a.y), ny = b.x - a.x, n = Math.sqrt(nx*nx + ny*ny) || 1;
      nx /= n; ny /= n;
      if (nx * (p.x - center.x) + ny * (p.y - center.y) < 0) { nx = -nx; ny = -ny; }
      var p1 = map.layerPointToLatLng(L.point(p.x - nx*5, p.y - ny*5)), p2 = map.layerPointToLatLng(L.point(p.x + nx*5, p.y + ny*5));
      L.polyline([p1, p2], { color:tickColor, weight:1.2, interactive:false }).addTo(ticks);
      var lp = map.layerPointToLatLng(L.point(p.x + nx*16, p.y + ny*16));
      L.marker(lp, { interactive:false, icon:L.divIcon({ className:'', html:'<div class="km-tick">' + m.km + 'K</div>', iconSize:[40,14], iconAnchor:[20,7] }) }).addTo(ticks);
    });
  }
  map.on('zoomend moveend', drawTicks);
  window.__setRoute = function(coords, fallback, showCurrent, fit, kmMarks){
    mode = fit;
    marks = kmMarks || [];
    var pts = coords.map(toLatLng);
    glow.setLatLngs(pts);
    line.setLatLngs(pts);
    if (pts.length > 0) { start.setLatLng(pts[0]).addTo(map); } else { map.removeLayer(start); }
    // 요약·상세: 도착점을 채운 점으로(범례 출발 ○ · 도착 ●)
    if (fit === 'route' && pts.length > 1) { end.setLatLng(pts[pts.length - 1]).addTo(map); } else { map.removeLayer(end); }
    var cur = pts.length > 0 ? pts[pts.length - 1] : (fallback ? toLatLng(fallback) : null);
    if (showCurrent && cur) { me.setLatLng(cur).addTo(map); } else { map.removeLayer(me); }
    if (fit === 'route' && pts.length > 1) { map.fitBounds(line.getBounds(), { padding:[24,24] }); }
    else if (cur && !placed) { map.setView(cur, 16); placed = true; }
    else if (cur && following) { map.panTo(cur, { animate:true, duration:0.5 }); }
    else if (!cur && !placed) { map.setView([37.5665,126.978], 13); }
    drawTicks();
    drawCloud();
  };
  var placed = false;
  window.__recenter = function(){
    following = true;
    var pts = line.getLatLngs();
    var cur = pts.length > 0 ? pts[pts.length - 1] : (me._map ? me.getLatLng() : null);
    if (mode === 'route' && pts.length > 1) map.fitBounds(line.getBounds(), { padding:[24,24] });
    else if (cur) map.setView(cur, Math.max(map.getZoom(), 15));
  };
  // 경로 점의 화면 좌표(지도 왼쪽 위 기준)를 앱으로 보낸다
  window.__project = function(){
    var pts = line.getLatLngs().map(function(ll){ var q = map.latLngToContainerPoint(ll); return [q.x, q.y]; });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'project', pts:pts }));
  };
</script>
</body>
</html>`;
}

export const RouteMap = forwardRef<RouteMapHandle, Props>(function RouteMap(
  { coordinates, fallbackCenter, showCurrent = false, fit = 'follow', kmTicks = false, interactive = false, highlighter = false, cloud = false, style },
  ref,
) {
  const c = useColors();
  const dark = useScheme() === 'dark';
  const webViewRef = useRef<WebViewHandle>(null);
  // HTML은 처음 테마로 한 번만 — 테마 전환은 __setTheme 주입(D3)
  const { initial, applyTheme } = useMapTheme(webViewRef, c, dark);
  const html = useMemo(() => buildHtml(initial.p, initial.dark, interactive, highlighter, cloud), [initial, interactive, highlighter, cloud]);
  const projectWaiters = useRef<((pts: [number, number][]) => void)[]>([]);
  const loaded = useRef(false);

  const marks = useMemo(() => (kmTicks ? kmMarks(coordinates) : []), [kmTicks, coordinates]);

  const push = () => {
    if (!loaded.current) return;
    const args = [coordinates, fallbackCenter ?? null, showCurrent, fit, marks].map((a) => JSON.stringify(a)).join(',');
    webViewRef.current?.injectJavaScript(`window.__setRoute(${args});true;`);
  };

  useEffect(push, [coordinates, fallbackCenter, showCurrent, fit, marks]);

  useImperativeHandle(ref, () => ({
    recenter: () => webViewRef.current?.injectJavaScript('window.__recenter();true;'),
    projectRoute: () => new Promise<[number, number][]>((resolve) => {
      if (!loaded.current) { resolve([]); return; }
      // 지도가 응답하지 않으면 0.4초 뒤 빈 목록으로
      const timer = setTimeout(() => { projectWaiters.current = projectWaiters.current.filter((w) => w !== done); resolve([]); }, 400);
      const done = (pts: [number, number][]) => { clearTimeout(timer); resolve(pts); };
      projectWaiters.current.push(done);
      webViewRef.current?.injectJavaScript('window.__project();true;');
    }),
  }), []);

  return (
    <View style={[styles.root, { backgroundColor: c.map.bg }, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        style={StyleSheet.absoluteFill}
        onLoadStart={() => { loaded.current = false; }}
        onLoadEnd={() => { loaded.current = true; applyTheme(); push(); }}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'project') {
              const waiters = projectWaiters.current;
              projectWaiters.current = [];
              waiters.forEach((w) => w(msg.pts));
            }
          } catch { /* 다른 메시지는 무시 */ }
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
});
