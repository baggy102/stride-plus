import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useColors, useScheme } from '@/theme/useColors';
import type { Palette } from '@/theme/colors';
import { baseMapScript, leafletHead, useMapTheme } from '@/components/map/mapHtml';

// 경로를 보여 주는 정적 지도(손으로 움직이지 않음). 기록 중(S06)·요약(S07)·상세(S10)에서 쓴다.
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
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl:false, dragging:false, touchZoom:false, doubleClickZoom:false, scrollWheelZoom:false, boxZoom:false, keyboard:false, tap:false });
${baseMapScript(p, dark)}
  var line = L.polyline([], { color:'${m.dot}', weight:4.5, lineCap:'round', lineJoin:'round' }).addTo(map);
  var start = L.circleMarker([0,0], { radius:5, color:'${m.dot}', weight:2.4, fillColor:'${m.bg}', fillOpacity:1 });
  var me = L.circleMarker([0,0], { radius:7, color:'${m.meRing}', weight:3, fillColor:'${m.meFill}', fillOpacity:1 });
  var end = L.circleMarker([0,0], { radius:5, color:'${m.dot}', weight:2.4, fillColor:'${m.dot}', fillOpacity:1 });
  var mode = 'follow';
  window.__onTheme = function(c){
    line.setStyle({ color:c.dot });
    start.setStyle({ color:c.dot, fillColor:c.bg });
    me.setStyle({ color:c.meRing, fillColor:c.meFill });
    end.setStyle({ color:c.dot, fillColor:c.dot });
  };
  function toLatLng(c){ return [c[1], c[0]]; }
  window.__setRoute = function(coords, fallback, showCurrent, fit){
    mode = fit;
    var pts = coords.map(toLatLng);
    line.setLatLngs(pts);
    if (pts.length > 0) { start.setLatLng(pts[0]).addTo(map); } else { map.removeLayer(start); }
    // 요약·상세: 도착점을 채운 점으로(범례 출발 ○ · 도착 ●)
    if (fit === 'route' && pts.length > 1) { end.setLatLng(pts[pts.length - 1]).addTo(map); } else { map.removeLayer(end); }
    var cur = pts.length > 0 ? pts[pts.length - 1] : (fallback ? toLatLng(fallback) : null);
    if (showCurrent && cur) { me.setLatLng(cur).addTo(map); } else { map.removeLayer(me); }
    if (fit === 'route' && pts.length > 1) { map.fitBounds(line.getBounds(), { padding:[24,24] }); }
    else if (cur) { map.setView(cur, 16); }
    else { map.setView([37.5665,126.978], 13); }
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
  { coordinates, fallbackCenter, showCurrent = false, fit = 'follow', style },
  ref,
) {
  const c = useColors();
  const dark = useScheme() === 'dark';
  const webViewRef = useRef<WebView>(null);
  // HTML은 처음 테마로 한 번만 — 테마 전환은 __setTheme 주입(D3)
  const { initial, applyTheme } = useMapTheme(webViewRef, c, dark);
  const html = useMemo(() => buildHtml(initial.p, initial.dark), [initial]);
  const loaded = useRef(false);

  const push = () => {
    if (!loaded.current) return;
    const args = [coordinates, fallbackCenter ?? null, showCurrent, fit].map((a) => JSON.stringify(a)).join(',');
    webViewRef.current?.injectJavaScript(`window.__setRoute(${args});true;`);
  };

  useEffect(push, [coordinates, fallbackCenter, showCurrent, fit]);

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
