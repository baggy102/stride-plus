import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useColors, useScheme } from '@/theme/useColors';
import type { Palette } from '@/theme/colors';
import { baseMapScript, leafletHead, useMapTheme, type WebViewHandle } from '@/components/map/mapHtml';
import { useMapRecovery } from '@/components/map/useMapRecovery';
import { kmMarks } from '@/utils/route';
import { smoothRoute, snapKmMarks } from '@/utils/routeSmooth';
import { bandStyles, coreSteps, LINE_V2, lineLook, SEAM } from '@/utils/routeLine';

// 경로를 실제 지도 위 좌표에 그린다. 기록 중(따라가기·손으로 이동)·요약·상세(경로 맞춤)에서 쓴다.
// 좌표는 GeoJSON [lng, lat]. HTML은 테마가 바뀔 때만 다시 만들고, 경로는 __setRoute로만 갱신한다.
// 선은 경로 선 v2(2026-11-24): 원래 좌표는 그대로 두고 미터 기준으로 매끈하게 한 사본만 지도로 보낸다.
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
  /** 마지막 좌표를 「지금 위치」 빛 머리로 표시 */
  showCurrent?: boolean;
  /** 경로 전체가 보이게 맞출지(요약·상세), 마지막 위치를 따라갈지(기록 중) */
  fit?: 'route' | 'follow';
  /** 1 km마다 선 위 빛 알갱이 + 경로 바깥쪽 「1K」 라벨(Frost S10) */
  kmTicks?: boolean;
  /** 손으로 움직이고 확대할 수 있게(기록 중). 끌면 따라가기를 멈추고 recenter로 다시 켠다 */
  interactive?: boolean;
  /** 굵은 선(기록 중 · 요약) */
  highlighter?: boolean;
  /** 선 둘레에 빛 가루(얼음빛 점 구름)를 뿌리고, 지도 타일은 한 톤 누른다 */
  cloud?: boolean;
  /** 일시정지(기록 중): 머리가 warn 테로 바뀌고 빛 · 속선이 꺼진다 */
  paused?: boolean;
  style?: ViewStyle;
}

function buildHtml(p: Palette, dark: boolean, interactive: boolean, highlighter: boolean, cloud: boolean) {
  const m = p.map;
  // 선 몸 굵기(기록 중 4.4 · 요약 4 · 상세 · 카드 3.4)와 빛 머리 번짐 반지름
  const body = highlighter ? (cloud && !interactive ? 4 : 4.4) : 3.4;
  const bloom = highlighter ? 20 : 16;
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
    .lv2-dust { pointer-events:none; }
    .leaflet-zoom-anim .lv2-dust { visibility:hidden; }
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
  var CLOUD = ${cloud};
  // 경로 선 v2: 띠 8개 × 바깥 빛 · 안쪽 빛 · 선 몸 + 머리 쪽 속선 6조각 = 지도 SVG 안 Path 30개(경로가 바뀌어도 점만 바꾼다).
  // 선 몸 · 속선은 땅 위에 쌓은 것과 같은 불투명 색(tone.bodies · cores)으로, 다음 띠 밑까지 화면 SEAM px 늘려 이음매 틈이 없다
  var B = ${body}, BLOOM = ${bloom}, Z = 18, SEAM = ${SEAM};
  var LV2 = ${JSON.stringify(LINE_V2)};
  var BANDS = ${JSON.stringify(bandStyles(body))}, BANDS_P = ${JSON.stringify(bandStyles(body, { paused: true }))}, CORE = ${JSON.stringify(coreSteps())};
  var tone = ${JSON.stringify(lineLook(p))}, land = '${m.bg}';
  function poly(){ return L.polyline([], { interactive:false, lineCap:'butt', lineJoin:'round' }).addTo(map); }
  var outer = BANDS.map(poly), inner = BANDS.map(poly), body = BANDS.map(poly), core = CORE.map(poly);
  var lls = [], cum = [], T = 0, rawN = 0, paused = false;
  function styleLine(){
    (paused ? BANDS_P : BANDS).forEach(function(s, i){
      outer[i].setStyle({ color:tone.outer, weight:s.outerW, opacity:s.outerOp });
      inner[i].setStyle({ color:tone.body, weight:s.innerW, opacity:s.innerOp });
      body[i].setStyle({ color:(paused ? tone.bodiesPaused : tone.bodies)[i], weight:s.bodyW, opacity:1 });
    });
    CORE.forEach(function(k, j){ core[j].setStyle({ color:tone.cores[j], weight:B * LV2.core.mul, opacity:paused ? 0 : 1 }); });
  }
  styleLine();
  // 길이(Z 줌 px) a~b 구간의 [lat,lng](양 끝 보간)
  function cumOf(ps){ var c = [0]; for (var i = 1; i < ps.length; i++) c.push(c[i-1] + Math.hypot(ps[i][0]-ps[i-1][0], ps[i][1]-ps[i-1][1])); return c; }
  function find(c, L){ var n = c.length - 1; if (L <= 0) return [0, 0]; if (L >= c[n]) return [n - 1, 1];
    var lo = 0, hi = n; while (hi - lo > 1) { var md = (lo + hi) >> 1; if (c[md] <= L) lo = md; else hi = md; }
    var s = c[hi] - c[lo]; return [lo, s > 0 ? (L - c[lo]) / s : 0]; }
  function mix(a, b, f){ return [a[0] + (b[0]-a[0]) * f, a[1] + (b[1]-a[1]) * f]; }
  function slice(arr, c, a, b){ var A = find(c, a), E = find(c, b), out = [mix(arr[A[0]], arr[A[0]+1], A[1])];
    for (var i = A[0] + 1; i <= E[0]; i++) out.push(arr[i]); out.push(mix(arr[E[0]], arr[E[0]+1], E[1])); return out; }
  // 화면 1 px이 Z 줌에서 몇 px인가(속선 30 px · 이음매 겹침은 화면 기준이라 줌마다 다시)
  function zpx(){ var z = map.getZoom(); if (z === undefined || isNaN(z)) z = 16; return Math.pow(2, Z - z); }
  function setBands(){
    if (lls.length < 2) { outer.concat(inner, body, core).forEach(function(l){ l.setLatLngs([]); }); return; }
    var k = zpx(), seam = SEAM * k, tl = Math.min(T, LV2.core.len * k);
    BANDS.forEach(function(s, i){ var part = slice(lls, cum, T * s.t0, T * s.t1); outer[i].setLatLngs(part); inner[i].setLatLngs(part); body[i].setLatLngs(slice(lls, cum, T * s.t0, Math.min(T, T * s.t1 + seam))); });
    CORE.forEach(function(c, j){ core[j].setLatLngs(slice(lls, cum, T - tl + tl * c.f0, Math.min(T, T - tl + tl * c.f1 + seam))); });
  }
  map.on('zoomend', setBands);
  // 손으로 지도를 끌면 따라가기를 멈춘다(현 위치 버튼으로 다시 켠다)
  var following = true;
  map.on('dragstart', function(){ following = false; });
  var ticks = L.layerGroup().addTo(map);
  var marks = [];
  var tickColor = '${p.text}';
  var markerPane = CLOUD ? map.createPane('above') : null;
  if (markerPane) markerPane.style.zIndex = 460;
  // 출발: 조용한 작은 고리(속 = 지도 바탕)
  var start = L.circleMarker([0,0], { pane: CLOUD ? 'above' : 'overlayPane', radius:LV2.start.r, color:tone.body, opacity:LV2.start.op, weight:LV2.start.w, fillColor:land, fillOpacity:1, interactive:false });
  // 지금 위치(기록 중) · 도착(요약 · 상세): 빛 머리 — 반지름 그라데이션 번짐 + 테 + 속. 일시정지는 warn 테 + 속
  function headIcon(){
    var H = LV2.head, R = paused ? 7 : BLOOM, s = R * 2, h;
    if (paused) h = '<circle r="' + H.pausedRing + '" fill="none" stroke="' + tone.warn + '" stroke-opacity="' + H.ringOp + '" stroke-width="' + H.ringW + '"/><circle r="' + H.core + '" fill="' + tone.warn + '"/>';
    else h = '<defs><radialGradient id="lv2head"><stop offset="0" stop-color="' + tone.body + '" stop-opacity="' + H.bloomIn + '"/><stop offset="' + H.bloomMid + '" stop-color="' + tone.outer + '" stop-opacity="' + H.bloomMidOp + '"/><stop offset="1" stop-color="' + tone.outer + '" stop-opacity="0"/></radialGradient></defs>'
      + '<circle r="' + R + '" fill="url(#lv2head)"/><circle r="' + H.ring + '" fill="none" stroke="' + tone.body + '" stroke-opacity="' + H.ringOp + '" stroke-width="' + H.ringW + '"/><circle r="' + H.core + '" fill="' + tone.head + '"/>';
    return L.divIcon({ className:'', iconSize:[s, s], iconAnchor:[R, R], html:'<svg width="' + s + '" height="' + s + '" viewBox="' + (-R) + ' ' + (-R) + ' ' + s + ' ' + s + '" style="display:block;overflow:visible">' + h + '</svg>' });
  }
  var head = L.marker([0,0], { icon:headIcon(), interactive:false, keyboard:false });
  var mode = 'follow';
  // 빛 가루(점 구름 대체): 선 둘레에 길이 2 px마다, 출발 6% 뒤부터, 지금 쪽일수록 넓고 진하게(몸 굵기만큼 넓혀 안쪽 빛 밖으로).
  // 자리는 레이어 px로 줌 · 경로가 바뀔 때만 계산하고, 캔버스는 지도와 같이 움직여 끌기 중에는 다시 그리지 않는다
  var dustPane = CLOUD ? map.createPane('lv2dust') : null, cv = null, cx = null, dots = [], PAD = 0.25;
  if (dustPane) {
    dustPane.style.zIndex = 455; dustPane.style.pointerEvents = 'none';
    cv = document.createElement('canvas'); cv.className = 'lv2-dust'; dustPane.appendChild(cv); cx = cv.getContext('2d');
  }
  function jit(i, k){ var x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return (x - Math.floor(x) - 0.5) * 2; }
  function buildDust(){
    dots = [];
    if (!cx || lls.length < 2) return;
    var D = LV2.dust, sc = B / D.body, q = lls.map(function(ll){ var pt = map.latLngToLayerPoint(ll); return [pt.x, pt.y]; }), c = cumOf(q), Tl = c[c.length - 1];
    function at(L){ var f = find(c, L); return mix(q[f[0]], q[f[0]+1], f[1]); }
    // 길이 step마다 고정 번호 → 경로가 자라도 이미 뿌린 자리는 그대로
    for (var k = Math.ceil(Tl * D.from / D.step); k * D.step < Tl; k++) {
      var L0 = k * D.step, t = L0 / Tl, a = at(L0), p1 = at(L0 - 1.5), p2 = at(L0 + 1.5), dx = p2[0] - p1[0], dy = p2[1] - p1[1], n = Math.hypot(dx, dy) || 1;
      for (var m2 = 0; m2 < (t > D.two ? 2 : 1); m2++) {
        var id = k * 2 + m2, off = jit(id, 1) * (1 + D.off * t) * sc, al = jit(id, 2) * D.along;
        dots.push([a[0] - dy / n * off + dx / n * al, a[1] + dx / n * off + dy / n * al, (D.r0 + D.r1 * t) * Math.sqrt(sc), D.op0 + D.op1 * t]);
      }
    }
  }
  function drawDust(){
    if (!cx) return;
    var size = map.getSize(), pw = Math.round(size.x * (1 + PAD * 2)), ph = Math.round(size.y * (1 + PAD * 2)), dpr = window.devicePixelRatio || 1;
    var origin = map.containerPointToLayerPoint([-size.x * PAD, -size.y * PAD]);
    if (cv.width !== pw * dpr || cv.height !== ph * dpr) { cv.width = pw * dpr; cv.height = ph * dpr; cv.style.width = pw + 'px'; cv.style.height = ph + 'px'; }
    L.DomUtil.setPosition(cv, origin);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, pw, ph);
    // 불투명도를 0.05 단위로 묶어 한 번에 채운다(가루 수와 상관없이 fill 십여 번)
    var kp = paused ? LV2.dust.paused : 1, level = -1;
    cx.fillStyle = tone.body;
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i], x = d[0] - origin.x, y = d[1] - origin.y, a = Math.round(d[3] * kp * 20) / 20;
      if (a !== level) { if (level >= 0) cx.fill(); cx.globalAlpha = a; cx.beginPath(); level = a; }
      if (x < -4 || y < -4 || x > pw + 4 || y > ph + 4) continue;
      cx.moveTo(x + d[2], y); cx.arc(x, y, d[2], 0, 6.2832);
    }
    if (level >= 0) cx.fill();
    cx.globalAlpha = 1;
  }
  if (CLOUD) {
    map.on('zoomend viewreset', function(){ buildDust(); drawDust(); });
    map.on('moveend resize', drawDust);
  }
  window.__onTheme = function(c){
    tone = c.line; land = c.bg;
    styleLine(); drawDust();
    tickColor = c.text;
    document.documentElement.style.setProperty('--tick', c.text);
    document.documentElement.style.setProperty('--halo', c.bg);
    drawTicks();
    start.setStyle({ color:tone.body, fillColor:land });
    head.setIcon(headIcon());
  };
  function toLatLng(c){ return [c[1], c[0]]; }
  function bounds(){ return L.latLngBounds(lls); }
  // km: 선 위 작은 빛 알갱이(선을 끊지 않는다) + 진행 방향의 수직, 경로 가운데 반대쪽(바깥) 16px 밖 라벨
  function drawTicks(){
    ticks.clearLayers();
    if (!marks.length || lls.length < 2) return;
    var center = map.latLngToLayerPoint(bounds().getCenter());
    marks.forEach(function(m){
      var p = map.latLngToLayerPoint(toLatLng(m.at)), a = map.latLngToLayerPoint(toLatLng(m.from)), b = map.latLngToLayerPoint(toLatLng(m.to));
      var nx = -(b.y - a.y), ny = b.x - a.x, n = Math.sqrt(nx*nx + ny*ny) || 1;
      nx /= n; ny /= n;
      if (nx * (p.x - center.x) + ny * (p.y - center.y) < 0) { nx = -nx; ny = -ny; }
      L.circleMarker(toLatLng(m.at), { radius:LV2.km.r, stroke:false, fillColor:tone.core, fillOpacity:LV2.km.op, interactive:false }).addTo(ticks);
      var lp = map.layerPointToLatLng(L.point(p.x + nx*16, p.y + ny*16));
      L.marker(lp, { interactive:false, icon:L.divIcon({ className:'', html:'<div class="km-tick">' + m.km + 'K</div>', iconSize:[40,14], iconAnchor:[20,7] }) }).addTo(ticks);
    });
  }
  map.on('zoomend moveend', drawTicks);
  // coords: 매끈하게 한 사본, n: 원래 점 수(종료 가루 전환의 점 수), isPaused: 일시정지
  window.__setRoute = function(coords, fallback, showCurrent, fit, kmMarks, n, isPaused){
    mode = fit;
    marks = kmMarks || [];
    rawN = n || coords.length;
    var changed = paused !== !!isPaused;
    paused = !!isPaused;
    lls = coords.map(toLatLng);
    cum = cumOf(lls.map(function(ll){ var q = map.project(ll, Z); return [q.x, q.y]; }));
    T = cum[cum.length - 1] || 0;
    if (changed) { styleLine(); head.setIcon(headIcon()); }
    if (lls.length > 0) { start.setLatLng(lls[0]).addTo(map); } else { map.removeLayer(start); }
    var cur = lls.length > 0 ? lls[lls.length - 1] : (fallback ? toLatLng(fallback) : null);
    // 기록 중: 지금 위치. 요약·상세: 도착점(경로가 둘 이상일 때)
    var at = showCurrent && cur ? cur : (fit === 'route' && lls.length > 1 ? lls[lls.length - 1] : null);
    if (at) { head.setLatLng(at).addTo(map); } else { map.removeLayer(head); }
    if (fit === 'route' && lls.length > 1) { map.fitBounds(bounds(), { padding:[24,24] }); }
    else if (cur && !placed) { map.setView(cur, 16); placed = true; }
    else if (cur && following) { map.panTo(cur, { animate:true, duration:0.5 }); }
    else if (!cur && !placed) { map.setView([37.5665,126.978], 13); }
    setBands();
    drawTicks();
    buildDust(); drawDust();
  };
  var placed = false;
  window.__recenter = function(){
    following = true;
    var cur = lls.length > 0 ? lls[lls.length - 1] : (head._map ? head.getLatLng() : null);
    if (mode === 'route' && lls.length > 1) map.fitBounds(bounds(), { padding:[24,24] });
    else if (cur) map.setView(cur, Math.max(map.getZoom(), 15));
  };
  // 경로의 화면 좌표(지도 왼쪽 위 기준)를 앱으로 보낸다: 그린 선 위에 원래 점 수만큼 고르게
  window.__project = function(){
    var q = lls.map(function(ll){ var pt = map.latLngToContainerPoint(ll); return [pt.x, pt.y]; }), pts = [];
    if (q.length === 1) pts = q;
    else if (q.length > 1) {
      var c = cumOf(q), Tq = c[c.length - 1], k = Math.max(2, rawN);
      for (var i = 0; i < k; i++) { var f = find(c, Tq * i / (k - 1)); pts.push(mix(q[f[0]], q[f[0]+1], f[1])); }
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type:'project', pts:pts }));
  };
</script>
</body>
</html>`;
}

export const RouteMap = forwardRef<RouteMapHandle, Props>(function RouteMap(
  { coordinates, fallbackCenter, showCurrent = false, fit = 'follow', kmTicks = false, interactive = false, highlighter = false, cloud = false, paused = false, style },
  ref,
) {
  const c = useColors();
  const dark = useScheme() === 'dark';
  const webViewRef = useRef<WebViewHandle>(null);
  // HTML은 처음 테마로 한 번만 — 테마 전환은 __setTheme 주입(D3)
  const { initial, syncThemeOnLoad } = useMapTheme(webViewRef, c, dark);
  const html = useMemo(() => buildHtml(initial.p, initial.dark, interactive, highlighter, cloud), [initial, interactive, highlighter, cloud]);
  const projectWaiters = useRef<((pts: [number, number][]) => void)[]>([]);
  const loaded = useRef(false);
  // WebView가 죽거나 포그라운드 복귀 핑에 답이 없으면 다시 마운트한다(로드가 끝나면 onLoadEnd가 경로를 다시 넣는다)
  const { mapKey, handleMapMessage, crashProps } = useMapRecovery(webViewRef, loaded);

  // 그리는 사본(경로 선 v2). 거리 · 스플릿 · km 위치는 원래 좌표로 계산하고 그린 선 위로만 옮긴다
  const drawn = useMemo(() => smoothRoute(coordinates), [coordinates]);
  const marks = useMemo(() => (kmTicks ? snapKmMarks(coordinates, drawn, kmMarks(coordinates)) : []), [kmTicks, coordinates, drawn]);

  const push = () => {
    if (!loaded.current) return;
    const args = [drawn.pts, fallbackCenter ?? null, showCurrent, fit, marks, coordinates.length, paused].map((a) => JSON.stringify(a)).join(',');
    webViewRef.current?.injectJavaScript(`window.__setRoute(${args});true;`);
  };

  useEffect(push, [drawn, fallbackCenter, showCurrent, fit, marks, paused]);

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
        key={mapKey}
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        style={StyleSheet.absoluteFill}
        {...crashProps}
        onLoadStart={() => { loaded.current = false; }}
        onLoadEnd={() => { loaded.current = true; syncThemeOnLoad(); push(); }}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (handleMapMessage(msg)) return;
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
