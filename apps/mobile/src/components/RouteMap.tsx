import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useColors, useScheme } from '@/theme/useColors';
import type { Palette } from '@/theme/colors';
import { baseMapScript, leafletHead, useMapTheme } from '@/components/map/mapHtml';
import { kmMarks } from '@/utils/route';

// 경로를 보여 주는 정적 지도(손으로 움직이지 않음). 러닝 상세(S10)에서 쓴다(Frost에서 기록 중·요약은 격자 도면).
// 좌표는 GeoJSON [lng, lat]. HTML은 테마가 바뀔 때만 다시 만들고, 경로는 __setRoute로만 갱신한다.
export interface RouteMapHandle {
  recenter: () => void;
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
  style?: ViewStyle;
}

function buildHtml(p: Palette, dark: boolean) {
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
    .km-tick { font: 500 11px/14px ui-monospace, Menlo, monospace; letter-spacing: 0.04em; text-align: center; color: var(--tick);
      text-shadow: 0 0 2px var(--halo), 1px 1px 0 var(--halo), -1px -1px 0 var(--halo), 1px -1px 0 var(--halo), -1px 1px 0 var(--halo); }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl:false, dragging:false, touchZoom:false, doubleClickZoom:false, scrollWheelZoom:false, boxZoom:false, keyboard:false, tap:false });
${baseMapScript(p, dark)}
  var glow = L.polyline([], { color:'${m.dot}', weight:7.5, opacity:${p.dark ? 0.35 : 0}, lineCap:'round', lineJoin:'round' }).addTo(map);
  var line = L.polyline([], { color:'${m.dot}', weight:3.5, lineCap:'round', lineJoin:'round' }).addTo(map);
  var ticks = L.layerGroup().addTo(map);
  var marks = [];
  var tickColor = '${p.text}';
  var start = L.circleMarker([0,0], { radius:4.5, color:'${m.dot}', weight:2, fillColor:'${m.bg}', fillOpacity:1 });
  var me = L.circleMarker([0,0], { radius:7, color:'${m.meRing}', weight:3, fillColor:'${m.meFill}', fillOpacity:1 });
  var end = L.circleMarker([0,0], { radius:5.5, color:'${m.dotBorder}', weight:2, fillColor:'${m.dot}', fillOpacity:1 });
  var mode = 'follow';
  window.__onTheme = function(c){
    glow.setStyle({ color:c.dot, opacity:c.dark ? 0.35 : 0 });
    line.setStyle({ color:c.dot });
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
    else if (cur) { map.setView(cur, 16); }
    else { map.setView([37.5665,126.978], 13); }
    drawTicks();
  };
  window.__recenter = function(){
    var pts = line.getLatLngs();
    if (mode === 'route' && pts.length > 1) map.fitBounds(line.getBounds(), { padding:[24,24] });
    else if (pts.length > 0) map.setView(pts[pts.length - 1], 16);
  };
</script>
</body>
</html>`;
}

export const RouteMap = forwardRef<RouteMapHandle, Props>(function RouteMap(
  { coordinates, fallbackCenter, showCurrent = false, fit = 'follow', kmTicks = false, style },
  ref,
) {
  const c = useColors();
  const dark = useScheme() === 'dark';
  const webViewRef = useRef<WebView>(null);
  // HTML은 처음 테마로 한 번만 — 테마 전환은 __setTheme 주입(D3)
  const { initial, applyTheme } = useMapTheme(webViewRef, c, dark);
  const html = useMemo(() => buildHtml(initial.p, initial.dark), [initial]);
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
  }), []);

  return (
    <View style={[styles.root, { backgroundColor: c.map.bg }, style]} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        style={StyleSheet.absoluteFillObject}
        onLoadStart={() => { loaded.current = false; }}
        onLoadEnd={() => { loaded.current = true; applyTheme(); push(); }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
});
