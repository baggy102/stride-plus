import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Glass } from '@/components/Glass';
import { Wordmark } from '@/components/Wordmark';
import { LocateIcon, RouteIcon, AlertIcon } from '@/components/icons';
import { useTabBarClearance } from '@/components/FloatingTabBar';
import { FONT, monoLabel } from '@/theme/fonts';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MapPopupCard, POSTER_HEIGHT } from '@/components/MapPopupCard';
import { routeFxScript, type RouteFxOptions } from '@/components/map/routeFx';
import { traceLayerScript, type TraceColors } from '@/components/map/traceLayer';
import { routeGeometry, type LngLat } from '@/utils/route';
import { useAuthStore } from '@/store/auth';
import client, { BASE_URL } from '@/api/client';
import { useColors, useScheme } from '@/theme/useColors';
import { elevationStyle, type Palette } from '@/theme/colors';
import { baseMapScript, leafletHead, markerIconsScript, MARKER_PULSE_CSS, useMapTheme, type WebViewHandle } from '@/components/map/mapHtml';
import type { RunMarker } from '@/types/run';
import { FEED_FILTERS, HYPE_MIN_CHEERS, isHype, isNew, matchesFilter, runnerTone, safeImageUrl, type FeedFilter } from './feedFilter';

const SEOUL = { lat: 37.5665, lng: 126.978 };

// 서버 FindRunsDto의 radius 상한과 같다.
const MAX_RADIUS_M = 300000;

// cell: 지금 줌에서 화면 11px에 해당하는 미터(D3 칸, 서버 FindDensityDto 범위 5~5000)
type ViewportMessage = { type: 'viewport'; lat: number; lng: number; radius: number; cell: number };
type DensityCell = { lng: number; lat: number; n: number };
type RunMessage = { type: 'run'; run: RunMarker };
type MapTapMessage = { type: 'mapTap' };
type RunDetailResponse = { route?: { coordinates?: [number, number][] } };

// bottomOffset: 탭바에 가리지 않게 Leaflet 출처 표기를 올리는 높이
function buildHtml(lat: number, lng: number, p: Palette, dark: boolean, bottomOffset: number) {
  const m = p.map;
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  ${leafletHead({ cluster: true })}
  <style>
    * { margin:0; padding:0; }
    body { background: ${m.bg}; }
    #map { width:100vw; height:100vh; }
    .leaflet-bottom { bottom: ${bottomOffset}px !important; }
    /* Frost 축척: 모노 라벨 + ㄴ자 눈금 */
    .leaflet-control-scale { margin-left: 18px !important; }
    .leaflet-control-scale-line { background: transparent !important; border: 1.5px solid ${p.text} !important; border-top: 0 !important;
      color: ${p.text}; font: 500 10px/12px ui-monospace, Menlo, monospace; letter-spacing: 0.08em; padding: 0 4px; text-transform: uppercase; }
${MARKER_PULSE_CSS}
    @keyframes faceIn { from { transform: scale(0.86); opacity: 0.5; } to { transform: scale(1); opacity: 1; } }
    .face-in { animation: faceIn 220ms cubic-bezier(0.2,0.8,0.2,1); }
    @media (prefers-reduced-motion: reduce) { .face-in { animation: none; } }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map',{zoomControl:false}).setView([${lat},${lng}],13);
${baseMapScript(p, dark)}
  // 내 위치: 옅은 원(44) + 점(16, 테두리 3)
  var meHalo=L.circleMarker([${lat},${lng}],{radius:22,stroke:false,fillColor:'${m.meHalo}',fillOpacity:1,interactive:false}).addTo(map);
  var me=L.circleMarker([${lat},${lng}],{radius:6.5,color:'${m.meRing}',fillColor:'${m.meFill}',fillOpacity:1,weight:3,interactive:false}).addTo(map);
  L.control.scale({imperial:false,position:'bottomleft',maxWidth:64}).addTo(map);

${markerIconsScript(p)}

  // 얼굴 링 마커(TOTAL·HYPE·NEW). run에는 앱이 붙인 hype·fresh·cheers·avatar(검사한 주소)·initial·t·tone(사용자 색 칸)·operator가 있다
  var mode='total';
  var HEART='<svg width="9" height="9" viewBox="0 0 24 24" style="display:block"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 4.2 2.4h2c.6-1.3 2.1-2.4 4.2-2.4 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  function esc(s){return String(s).replace(/[&<>"']/g,function(ch){return '&#'+ch.charCodeAt(0)+';';});}
  function matches(run){return mode==='total'||(mode==='hype'&&run.hype)||(mode==='new'&&run.fresh);}
  function ringOf(run,base){var c=iconColors;return mode==='hype'&&run.hype?c.hype:(mode==='new'&&run.fresh?c.fresh:base);}
  // TOTAL 링 바탕: 운영자는 Indigo, 나머지는 사용자별 4색
  function toneOf(run){var c=iconColors;return run.operator?c.operator:c.runners[run.tone];}
  // 이니셜을 깔고 사진을 덮는다(사진을 못 받아도 이니셜이 보인다)
  function face(run,size,ring,ringW){
    var c=iconColors;
    var img=run.avatar?'<div style="position:absolute;inset:0;background:url('+run.avatar+') center/cover"></div>':'';
    return '<div style="position:relative;width:'+size+'px;height:'+size+'px;box-sizing:border-box;border-radius:50%;border:'+ringW+'px solid '+ring+';background:'+c.face+';overflow:hidden;display:flex;align-items:center;justify-content:center;font:600 '+Math.round(size*0.38)+'px/1 -apple-system,system-ui,sans-serif;color:'+c.faceText+'">'+esc(run.initial)+img+'</div>';
  }
  // HYPE에서 해당 러닝: Pearl 링 · 1.16배 · 번짐 · Pearl 응원 배지. NEW에서 해당 러닝: 민트 링. TOTAL에서 NEW 러닝엔 민트 점(오른쪽 위). 나머지는 흐리게
  // 응원 수: 보이는 러닝에 1개 이상이면 유리 칩(오른쪽 아래). 운영자: 왼쪽 아래 S 배지
  function faceIcon(run){
    var c=iconColors,on=matches(run),hot=mode==='hype'&&run.hype;
    var shadow=hot?'0 0 0 4px '+c.hypeSoft+',0 0 22px '+c.hypeGlow:'0 4px 12px rgba(0,0,0,'+(c.dark?0.45:0.16)+')';
    var badge=hot?'<div style="position:absolute;top:-2px;left:28px;display:flex;align-items:center;gap:3px;padding:3px 7px 3px 6px;border-radius:99px;background:'+c.hype+';color:'+c.onSocial+';font:600 11px/1 ui-monospace,Menlo,monospace;white-space:nowrap">'+HEART+run.cheers+'</div>'
      :(on&&run.cheers>0?'<div style="position:absolute;bottom:-1px;left:27px;display:flex;align-items:center;gap:2px;padding:2px 5px 2px 4px;border-radius:99px;background:'+c.glass+';border:1px solid '+c.glassBorder+';-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:'+c.text+';font:600 11px/1 ui-monospace,Menlo,monospace;white-space:nowrap">'+HEART+run.cheers+'</div>':'');
    var dot=mode==='total'&&run.fresh?'<div style="position:absolute;top:4px;right:4px;width:10px;height:10px;box-sizing:border-box;border-radius:50%;background:'+c.fresh+';border:2px solid '+c.ring+'"></div>':'';
    var op=run.operator?'<div style="position:absolute;bottom:1px;left:1px;width:14px;height:14px;box-sizing:border-box;border-radius:50%;background:'+c.operator+';border:2px solid '+c.ring+';display:flex;align-items:center;justify-content:center;color:'+c.onOperator+';font:700 8px/1 -apple-system,system-ui,sans-serif">S</div>':'';
    return L.divIcon({html:'<div class="face-in"><div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;transform:scale('+(hot?1.16:1)+');opacity:'+(on?1:0.38)+';filter:'+(on?'none':'grayscale(1)')+'"><div style="border-radius:50%;box-shadow:'+shadow+'">'+face(run,34,ringOf(run,toneOf(run)),2.5)+'</div>'+dot+op+badge+'</div></div>',className:'',iconSize:[44,44],iconAnchor:[22,22]});
  }
  // 묶음: 얼굴 최대 3개 겹침 + 수. 얼굴 순서 HYPE(응원 수) → NEW → 최근
  function rank(a,b){return (b.hype-a.hype)||(b.cheers-a.cheers)||(b.fresh-a.fresh)||(b.t-a.t);}
  function stackIcon(cl){
    var c=iconColors,runs=cl.getAllChildMarkers().map(function(m){return m.options.run;}).sort(rank);
    var top=runs.slice(0,3),anyOn=runs.some(matches),n=String(runs.length);
    var faces=top.map(function(run,i){
      return '<div style="margin-left:'+(i?-10:0)+'px;position:relative;z-index:'+(3-i)+';opacity:'+(matches(run)?1:0.5)+'">'+face(run,28,ringOf(run,toneOf(run)),2)+'</div>';
    }).join('');
    var w=Math.round(8+28+18*(top.length-1)+14+n.length*7.5);
    return L.divIcon({html:'<div class="face-in"><div style="display:inline-flex;align-items:center;padding:3px;border-radius:99px;background:'+c.glass+';border:1px solid '+c.glassBorder+';-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 8px 24px rgba(0,0,0,'+(c.dark?0.45:0.12)+');opacity:'+(anyOn?1:0.45)+';filter:'+(anyOn?'none':'grayscale(1)')+'">'+faces+'<div style="padding:0 8px 0 6px;font:500 12px/1 ui-monospace,Menlo,monospace;color:'+c.text+'">'+n+'</div></div></div>',className:'',iconSize:[w,36],iconAnchor:[w/2,18]});
  }

  var group=L.markerClusterGroup({iconCreateFunction:stackIcon,showCoverageOnHover:false,maxClusterRadius:60});
  map.addLayer(group);

  var lastRuns=[],markers=[];
${routeFxScript()}
${traceLayerScript()}
  // D3 바탕 색: 데이터 칸은 TOTAL 링과 같은 Ice(지도 피드에는 「새 길」 민트가 없다)
  window.__trace.setColors(${JSON.stringify(feedTraceColors(p))});

  // 테마 전환: 마커 아이콘과 내 위치 색을 바꾸고 지금 러닝을 다시 그린다(고른 경로는 앱이 다시 그린다)
  window.__onTheme=function(c){
    makeIcons(c);
    me.setStyle({color:c.meRing,fillColor:c.meFill});
    meHalo.setStyle({fillColor:c.meHalo});
    window.__setRuns(lastRuns);
  };

  window.__setRuns=function(runs){
    lastRuns=runs;
    group.clearLayers();
    markers=[];
    runs.forEach(function(run){
      if(!run.startPoint)return;
      var m=L.marker([run.startPoint[1],run.startPoint[0]],{icon:faceIcon(run),run:run});
      m.on('click',function(){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'run',run:run}));
      });
      markers.push(m);
    });
    group.addLayers(markers);
  };

  // 빈 지도 탭 → 열린 카드를 닫는다(마커 click은 지도로 버블링되지 않고, 끌기·핀치는 click이 아니다)
  map.on('click',function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapTap'}));});

  // 응원 수가 바뀐 러닝 하나만 다시 그린다(전체 다시 그리기 없음)
  window.__updateRun=function(next){
    lastRuns=lastRuns.map(function(run){return run._id===next._id?next:run;});
    markers.forEach(function(m){
      if(m.options.run._id!==next._id)return;
      m.options.run=next;
      m.setIcon(faceIcon(next));
      group.refreshClusters(m);
    });
  };

  // 필터 바꿈: 지도 가운데에서 바깥으로 0~260ms 물결처럼 아이콘을 바꾼다(묶음은 중간에 한 번)
  window.__setMode=function(next){
    mode=next;
    var center=map.latLngToContainerPoint(map.getCenter()),size=map.getSize(),far=Math.sqrt(size.x*size.x+size.y*size.y)/2;
    markers.forEach(function(m){
      var d=Math.min(1,map.latLngToContainerPoint(m.getLatLng()).distanceTo(center)/far);
      setTimeout(function(){m.setIcon(faceIcon(m.options.run));},Math.round(d*260));
    });
    setTimeout(function(){group.refreshClusters();},130);
  };

  function reportViewport(){
    var c=map.getCenter();
    var r=Math.min(Math.ceil(c.distanceTo(map.getBounds().getNorthEast())),${MAX_RADIUS_M});
    var mpp=40075016.686*Math.cos(c.lat*Math.PI/180)/Math.pow(2,map.getZoom()+8);
    var cell=Math.min(5000,Math.max(5,Math.round(mpp*11)));
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'viewport',lat:c.lat,lng:c.lng,radius:r,cell:cell}));
  }
  var moveTimer;
  map.on('moveend',function(){
    clearTimeout(moveTimer);
    moveTimer=setTimeout(reportViewport,500);
  });
  reportViewport();
</script>
</body>
</html>`;
}

type FeedState = 'normal' | 'empty' | 'error';

// 필터에 맞는 러닝이 없을 때 안내(지도에는 흐린 마커가 그대로 있다)
const NO_MATCH: Record<Exclude<FeedFilter, 'total'>, { title: string; sub: string }> = {
  hype: { title: '이 근처에 HYPE 러닝이 아직 없어요', sub: `응원을 ${HYPE_MIN_CHEERS}개 이상 받은 러닝이 여기에 떠요` },
  new: { title: '이 근처에 새로 올라온 러닝이 없어요', sub: '24시간 안에 올라온 러닝이 여기에 떠요' },
};

// 지도 WebView에 넘기는 러닝: 마커가 쓸 표시를 미리 붙인다(사진 주소는 검사한 것만)
function toMapRun(run: RunMarker, now: number) {
  return {
    ...run,
    hype: isHype(run),
    fresh: isNew(run, now),
    cheers: run.cheers ?? 0,
    avatar: safeImageUrl(run.userId.profileImageUrl, BASE_URL),
    initial: (run.userId.username?.[0] ?? '?').toUpperCase(),
    t: Date.parse(run.createdAt) || 0,
    tone: runnerTone(run.userId._id),
    operator: run.userId.role === 'operator',
  };
}

// 「NEARBY 2 KM」: 지금 보이는 지도 반경(1 km 단위, 최소 1)
function nearbyLabel(radiusM: number | null) {
  if (!radiusM) return null;
  return `NEARBY ${Math.max(1, Math.round(radiusM / 1000))} KM`;
}

// 경로 그리기 시작(카메라가 먼저 움직이고, 카드는 0.22초 뒤 올라온다)
const ROUTE_DELAY_MS = 380;
const HOME_LABEL = '집 근처 100m 가림 · 기본 ON';

function feedTraceColors(p: Palette): TraceColors {
  return { base: p.muted, ice: p.map.dot, mint: p.map.dot };
}

// 러닝마다 같은 가루 무늬(연출 시드)
function seedOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function MapFeed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  const c = useColors();
  const dark = useScheme() === 'dark';
  const styles = useMemo(() => makeStyles(c), [c]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const webViewRef = useRef<WebViewHandle>(null);
  // HTML은 처음 테마로 한 번만 — 테마 전환은 __setTheme 주입(D3, 재로드 없음)
  const { initial: initialTheme, applyTheme } = useMapTheme(webViewRef, c, dark);
  const html = useMemo(
    () => (center ? buildHtml(center.lat, center.lng, initialTheme.p, initialTheme.dark, tabClearance + 8) : ''),
    [center, initialTheme, tabClearance],
  );
  const [selected, setSelected] = useState<RunMarker | null>(null);
  // 빈 지도 탭 횟수: 열린 카드는 이 값이 바뀌면 닫힌다(새 카드는 열릴 때의 값을 기준으로 삼는다)
  const [dismissKey, setDismissKey] = useState(0);
  const [feedState, setFeedState] = useState<FeedState>('normal');
  const [filter, setFilter] = useState<FeedFilter>('total');
  const [noMatch, setNoMatch] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [radius, setRadius] = useState<number | null>(null);
  const skipFirstFocus = useRef(true);
  const lastViewport = useRef<ViewportMessage | null>(null);
  const lastRuns = useRef<RunMarker[] | null>(null);
  const filterRef = useRef(filter);
  const requestSeq = useRef(0);

  // 지금 필터에 맞는 러닝이 하나도 없는지(TOTAL은 언제나 false)
  const checkNoMatch = useCallback(() => {
    const runs = lastRuns.current ?? [];
    const now = Date.now();
    setNoMatch(runs.length > 0 && !runs.some((run) => matchesFilter(run, filterRef.current, now)));
  }, []);

  // 받은 러닝을 모두 지도에 올린다. 필터는 거르지 않고 마커 강조만 바꾼다(WebView는 다시 로드하지 않는다)
  const showRuns = useCallback(() => {
    const runs = lastRuns.current;
    if (!runs) return;
    const now = Date.now();
    setFeedState(runs.length > 0 ? 'normal' : 'empty');
    checkNoMatch();
    webViewRef.current?.injectJavaScript(`window.__setRuns(${JSON.stringify(runs.map((run) => toMapRun(run, now)))});true;`);
  }, [checkNoMatch]);

  const fetchRuns = useCallback(async ({ lat, lng, radius, cell }: ViewportMessage) => {
    const seq = ++requestSeq.current;
    // D3 바탕(이번 주 칸별 서로 다른 러너 수). 실패해도 러닝은 보여 주고 바탕 점만 남는다
    client.get<DensityCell[]>(`/runs/density?lat=${lat}&lng=${lng}&radius=${radius}&cell=${cell}`)
      .then((res) => {
        if (seq === requestSeq.current) webViewRef.current?.injectJavaScript(`window.__trace.setCells(${JSON.stringify(res.data)});true;`);
      })
      .catch(() => {});
    try {
      const res = await client.get<RunMarker[]>(`/runs?lat=${lat}&lng=${lng}&radius=${radius}`);
      // 늦게 도착한 이전 요청의 응답은 버린다
      if (seq !== requestSeq.current) return;
      lastRuns.current = res.data;
      showRuns();
    } catch {
      if (seq === requestSeq.current) setFeedState('error');
    }
  }, [showRuns]);

  useEffect(() => {
    filterRef.current = filter;
    checkNoMatch();
    webViewRef.current?.injectJavaScript(`window.__setMode&&window.__setMode(${JSON.stringify(filter)});true;`);
  }, [filter, checkNoMatch]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } else {
        setCenter(SEOUL);
      }
    })();
  }, []);

  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    if (lastViewport.current) fetchRuns(lastViewport.current);
  }, [fetchRuns]));

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webViewRef.current?.injectJavaScript(`map.flyTo([${latitude},${longitude}],Math.max(map.getZoom(),13));true;`);
    } catch {}
  }, []);

  // 마커를 고르면 그 기록의 경로를 받는다(목록 응답에는 경로가 없다). 남의 러닝은 서버가 집 근처를 잘라 보낸다
  const cardBottom = tabClearance + 12;
  const myId = useAuthStore((s) => s.user?._id);
  const [selectedRoute, setSelectedRoute] = useState<{ id: string; coords: LngLat[] } | null>(null);
  useEffect(() => {
    setSelectedRoute(null);
    if (!selected) { webViewRef.current?.injectJavaScript('window.__routeFx&&window.__routeFx.clear();true;'); return; }
    let cancelled = false;
    client.get<RunDetailResponse>(`/runs/${selected._id}`)
      .then((res) => {
        if (cancelled) return;
        const coords = res.data.route?.coordinates ?? [];
        setSelectedRoute({ id: selected._id, coords });
        const pad = [headerHeight + 16, cardBottom + POSTER_HEIGHT + 24];
        webViewRef.current?.injectJavaScript(`window.__fitRoute(${JSON.stringify(coords)},${JSON.stringify(pad)});true;`);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // 헤더 높이가 바뀌어도 다시 받지 않는다
  }, [selected]);

  // 경로 연출 A+: 처음엔 그리며 재생, 필터·테마만 바뀌면 끝 상태로 색만 바꾼다
  const drawnId = useRef<string | null>(null);
  const routeColor = selected
    ? filter === 'hype' && isHype(selected) ? c.hype : filter === 'new' && isNew(selected, Date.now()) ? c.fresh : c.map.dot
    : c.map.dot;
  const mine = !!selected && selected.userId._id === myId;
  useEffect(() => {
    if (!selectedRoute) { drawnId.current = null; return; }
    const geometry = routeGeometry(selectedRoute.coords, mine);
    const options: RouteFxOptions = {
      col: routeColor, bg: c.bg, glass: c.glass, glassBorder: c.glassBorder, text: c.text, text2: c.text2,
      label: mine ? HOME_LABEL : null,
      delay: ROUTE_DELAY_MS,
      keep: drawnId.current === selectedRoute.id,
      seed: seedOf(selectedRoute.id),
    };
    drawnId.current = selectedRoute.id;
    webViewRef.current?.injectJavaScript(`window.__routeFx.show(${JSON.stringify(geometry)},${JSON.stringify(options)});true;`);
  }, [selectedRoute, routeColor, mine, c]);

  // D3 바탕 색은 테마를 따른다
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`window.__trace&&window.__trace.setColors(${JSON.stringify(feedTraceColors(c))});true;`);
  }, [c]);

  // 응원이 바뀌면 목록 값을 고치고 그 마커 하나만 다시 그린다(응원 수 칩·HYPE). 필터 결과가 바뀔 수 있어 안내도 다시 본다
  const onCheered = useCallback((runId: string, cheers: number, cheered: boolean) => {
    const runs = lastRuns.current;
    const run = runs?.find((r) => r._id === runId);
    if (!runs || !run) return;
    const next = { ...run, cheers, cheered };
    lastRuns.current = runs.map((r) => (r._id === runId ? next : r));
    checkNoMatch();
    webViewRef.current?.injectJavaScript(`window.__updateRun(${JSON.stringify(toMapRun(next, Date.now()))});true;`);
  }, [checkNoMatch]);

  const retry = useCallback(() => {
    if (lastViewport.current) fetchRuns(lastViewport.current);
  }, [fetchRuns]);

  if (!html) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.value} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={StyleSheet.absoluteFill}
        originWhitelist={['*']}
        javaScriptEnabled
        startInLoadingState
        // 로드 중에 테마가 바뀌었을 수 있다
        onLoadEnd={() => {
          applyTheme();
          webViewRef.current?.injectJavaScript(`window.__trace.setColors(${JSON.stringify(feedTraceColors(c))});true;`);
        }}
        onMessage={(e) => {
          try {
            const message = JSON.parse(e.nativeEvent.data) as ViewportMessage | RunMessage | MapTapMessage;
            if (message.type === 'viewport') {
              lastViewport.current = message;
              setRadius(message.radius);
              fetchRuns(message);
            } else if (message.type === 'mapTap') {
              setDismissKey((k) => k + 1);
            } else {
              setSelected(message.run);
            }
          } catch {}
        }}
      />

      {/* 헤더: 세로 페이드 위 워드마크(+ NEARBY 반경) + TOTAL · HYPE · NEW */}
      <View
        style={[styles.header, { paddingTop: insets.top + 8 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >
        <LinearGradient colors={c.headerFade} locations={[0, 0.62, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.logoRow}>
          <Wordmark width={71} />
          {nearbyLabel(radius) && <Text style={styles.nearby}>{nearbyLabel(radius)}</Text>}
        </View>
        <Glass style={styles.seg}>
          {FEED_FILTERS.map(({ key, label, a11y }) => {
            const on = key === filter;
            const fill = key === 'hype' ? c.hype : key === 'new' ? c.fresh : c.chipOnBg;
            const ink = key === 'total' ? c.chipOnFg : c.onSocial;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={a11y}
                accessibilityState={{ selected: on }}
                hitSlop={{ top: 4, bottom: 4 }}
                onPress={() => setFilter(key)}
                style={[styles.segBtn, on && { backgroundColor: fill }]}
              >
                <Text style={[styles.segText, { color: on ? ink : c.text }]}>{label}</Text>
              </Pressable>
            );
          })}
        </Glass>
      </View>

      {/* 필터에 맞는 러닝 없음 */}
      {feedState === 'normal' && noMatch && filter !== 'total' && headerHeight > 0 && (
        <View accessibilityRole="summary" style={[styles.noticeShadow, { top: headerHeight + 12 }]}>
          <Glass style={styles.notice}>
            <View style={styles.noticeIcon}>
              <RouteIcon color={c.text2} />
            </View>
            <View style={styles.noticeBody}>
              <Text style={styles.noticeTitle}>{NO_MATCH[filter].title}</Text>
              <Text style={styles.noticeSub}>{NO_MATCH[filter].sub}</Text>
            </View>
          </Glass>
        </View>
      )}

      {/* 빈 상태 · 조회 실패 */}
      {feedState !== 'normal' && headerHeight > 0 && (
        <View
          accessibilityRole={feedState === 'error' ? 'alert' : 'summary'}
          style={[styles.noticeShadow, { top: headerHeight + 12 }]}
        >
          <Glass style={styles.notice}>
          <View style={styles.noticeIcon}>
            {feedState === 'error' ? <AlertIcon color={c.text2} /> : <RouteIcon color={c.text2} />}
          </View>
          <View style={styles.noticeBody}>
            <Text style={styles.noticeTitle}>
              {feedState === 'error' ? '불러오지 못했어요' : '이 근처에는 아직 러닝 기록이 없어요'}
            </Text>
            {feedState === 'empty' && <Text style={styles.noticeSub}>지도를 옮기거나 첫 러닝을 기록해 보세요</Text>}
          </View>
          {feedState === 'error' && (
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retryBtn}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          )}
          </Glass>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="내 위치로 이동"
        style={[styles.myLocShadow, { bottom: (selected ? cardBottom + POSTER_HEIGHT : tabClearance) + 12 }]}
        onPress={handleMyLocation}
      >
        <Glass style={styles.myLocBtn}>
          <LocateIcon color={c.text} />
        </Glass>
      </Pressable>

      {selected && (
        <MapPopupCard
          key={selected._id}
          run={selected}
          baseUrl={BASE_URL}
          bottom={cardBottom}
          route={selectedRoute?.id === selected._id ? selectedRoute.coords : undefined}
          routeColor={routeColor}
          mine={mine}
          onCheered={onCheered}
          dismissKey={dismissKey}
          onClose={() => setSelected(null)}
          onUserPress={(userId) => {
            setSelected(null);
            router.push(`/user/${userId}`);
          }}
          onDetailPress={(runId) => router.push(`/run/${runId}`)}
        />
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.map.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  logoRow: { alignItems: 'center', justifyContent: 'center', marginVertical: 6, minHeight: 20 },
  nearby: { position: 'absolute', right: 4, top: 4, ...monoLabel(10), color: c.navOff },
  // TOTAL · HYPE · NEW 세그먼트(유리 알약 안 3칸, 고른 칸만 채움)
  seg: { flexDirection: 'row', alignSelf: 'center', marginTop: 10, padding: 4, gap: 2, borderRadius: 22 },
  segBtn: { height: 36, minWidth: 76, paddingHorizontal: 16, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  segText: { ...monoLabel(13, 0.08) },
  noticeShadow: {
    position: 'absolute', left: 16, right: 16, borderRadius: 16,
    ...elevationStyle(c),
  },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: 16,
  },
  noticeIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  noticeBody: { flex: 1, gap: 2 },
  noticeTitle: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20, color: c.text },
  noticeSub: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, color: c.text2 },
  retryBtn: {
    height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center',
    borderWidth: 1, borderColor: c.glassBorder,
  },
  retryText: { fontFamily: FONT.semibold, fontSize: 14, color: c.text },
  myLocShadow: {
    position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22,
    ...elevationStyle(c),
  },
  myLocBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
