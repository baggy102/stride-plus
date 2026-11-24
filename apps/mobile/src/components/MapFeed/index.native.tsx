import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text, AppState } from 'react-native';
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
import { routeFxScript, routeFxTone, type RouteFxOptions } from '@/components/map/routeFx';
import { traceLayerScript, type TraceColors } from '@/components/map/traceLayer';
import { routeGeometry, type LngLat } from '@/utils/route';
import { smoothGeometry } from '@/utils/routeSmooth';
import { useAuthStore } from '@/store/auth';
import client, { BASE_URL } from '@/api/client';
import { useColors, useScheme } from '@/theme/useColors';
import { elevationStyle, type Palette } from '@/theme/colors';
import { baseMapScript, leafletHead, markerIconsScript, MARKER_PULSE_CSS, useMapTheme, type WebViewHandle } from '@/components/map/mapHtml';
import { useMapRecovery, type MapPageMessage } from '@/components/map/useMapRecovery';
import * as SecureStorage from '@/utils/secureStorage';
import type { RunMarker } from '@/types/run';
import { FEED_FILTERS, HYPE_MIN_CHEERS, isHype, isOpener, matchesFilter, runnerTone, safeImageUrl, type FeedFilter } from './feedFilter';
import { routeDraw } from './routeDraw';

const SEOUL = { lat: 37.5665, lng: 126.978 };

// 서버 FindRunsDto의 radius 상한과 같다.
const MAX_RADIUS_M = 300000;

// 지난 세션의 마지막 지도 중심(기기 저장). 위치를 기다리지 않고 지도를 바로 띄울 때 마지막 위치 다음 후보
const CENTER_KEY = 'mapFeedCenter';
// 마지막으로 알려진 위치는 10분 안의 것만 쓴다(더 오래되면 내 위치 점이 엉뚱한 곳에 찍힌다). 1초 안에 안 오면 건너뛴다
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;
const QUICK_WAIT_MS = 1000;
// 정확한 측위는 뒤에서 받는다. 이 시간 안에 오면 지도를 옮기고, 늦게 오면 내 위치 점만 옮긴다
const FIX_TIMEOUT_MS = 4000;

type LatLng = { lat: number; lng: number };

// 기다리되 ms가 지나거나 실패하면 null(지도 시작이 기기 응답에 묶이지 않게)
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(resolve, () => resolve(null)).finally(() => clearTimeout(timer));
  });
}

function parseCenter(raw: string | null): LatLng | null {
  if (!raw) return null;
  try {
    const { lat, lng } = JSON.parse(raw) as Partial<LatLng>;
    if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

// cell: 지금 줌에서 화면 11px에 해당하는 미터(D3 칸, 서버 FindDensityDto 범위 5~5000). zoom: WebView를 다시 만들 때 보던 화면으로 되돌린다
type ViewportMessage = { type: 'viewport'; lat: number; lng: number; radius: number; cell: number; zoom: number };
type DensityCell = { lng: number; lat: number; n: number };
type RunMessage = { type: 'run'; run: RunMarker };
type MapTapMessage = { type: 'mapTap' };
// GET /runs/new-cells: 「이번 주 새 길」 칸(고정 50m 지리 칸)과 칸을 연 러닝별 km
type NewCellsResponse = { cellMeters: number; cells: { lng: number; lat: number; runId: string }[]; runs: { runId: string; km: number }[] };
type RunDetailResponse = { route?: { coordinates?: [number, number][] } };

// center: 처음 지도 중심. me: 처음 내 위치(모르면 null — 측위가 오면 __setMe가 점을 붙인다)
// bottomOffset: 탭바에 가리지 않게 Leaflet 출처 표기를 올리는 높이
function buildHtml({ lat, lng }: LatLng, me: LatLng | null, p: Palette, dark: boolean, bottomOffset: number) {
  const m = p.map;
  const meAt = me ? [me.lat, me.lng] : [lat, lng];
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
  // 내 위치: 옅은 원(44) + 점(16, 테두리 3). 아직 모르면 측위가 온 뒤 __setMe가 붙인다
  var meHalo=L.circleMarker(${JSON.stringify(meAt)},{radius:22,stroke:false,fillColor:'${m.meHalo}',fillOpacity:1,interactive:false});
  var me=L.circleMarker(${JSON.stringify(meAt)},{radius:6.5,color:'${m.meRing}',fillColor:'${m.meFill}',fillOpacity:1,weight:3,interactive:false});
  if(${!!me}){meHalo.addTo(map);me.addTo(map);}
  // 측위가 오면 내 위치 점을 옮기고, move면 지도도 옮긴다(사용자가 이미 지도를 끌었으면 그대로). 멀면 애니메이션 없이(날아가는 동안 중간 타일을 받지 않게)
  var dragged=false;
  map.on('dragstart',function(){dragged=true;});
  window.__setMe=function(lat,lng,move){
    var at=[lat,lng];meHalo.setLatLng(at).addTo(map);me.setLatLng(at).addTo(map);
    if(!move||dragged)return;
    var z=Math.max(map.getZoom(),13);
    if(map.distance(map.getCenter(),at)>3000)map.setView(at,z,{animate:false});else map.flyTo(at,z);
  };
  L.control.scale({imperial:false,position:'bottomleft',maxWidth:64}).addTo(map);

${markerIconsScript(p)}

  // 얼굴 링 마커(TOTAL·HYPE·NEW). run에는 앱이 붙인 hype·fresh·cheers·avatar(검사한 주소)·initial·t·tone(사용자 색 칸)·operator가 있다
  var mode='total';
  var HEART='<svg width="9" height="9" viewBox="0 0 24 24" style="display:block"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 4.2 2.4h2c.6-1.3 2.1-2.4 4.2-2.4 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  function matches(run){return mode==='total'||(mode==='hype'&&run.hype)||(mode==='new'&&run.fresh);}
  function ringOf(run,base){var c=iconColors;return mode==='hype'&&run.hype?c.hype:(mode==='new'&&run.fresh?c.fresh:base);}
  // TOTAL 링 바탕: 운영자는 Indigo, 나머지는 사용자별 4색
  function toneOf(run){var c=iconColors;return run.operator?c.operator:c.runners[run.tone];}
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
    return stackPill(faces,top.length,n,anyOn);
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
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'viewport',lat:c.lat,lng:c.lng,radius:r,cell:cell,zoom:map.getZoom()}));
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
  hype: { title: '이 근처엔 아직 HYPE 러닝이 없어요', sub: `응원을 ${HYPE_MIN_CHEERS}개 이상 받은 러닝이 여기에 떠요` },
  new: { title: '이 근처엔 아직 이번 주 새 길이 없어요', sub: '한동안 아무도 달리지 않은 길을 달리면 여기에 떠요' },
};

// 지도 WebView에 넘기는 러닝: 마커가 쓸 표시를 미리 붙인다(사진 주소는 검사한 것만)
function toMapRun(run: RunMarker, openers: ReadonlySet<string>) {
  return {
    ...run,
    hype: isHype(run),
    // 이번 주 새 길을 연 러닝(NEW에서 켜지고, TOTAL에서는 오른쪽 위 민트 점)
    fresh: isOpener(run, openers),
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
// 실제 처리(서버 home-privacy: 남에게는 출발·도착 100m를 자른다)만 말한다. 「집」·「기본 ON」은 끄는 화면·법적 확인 전이라 쓰지 않음
const HOME_LABEL = '출발·도착 100m는 다른 사람에게 안 보여요';

function feedTraceColors(p: Palette): TraceColors {
  return { base: p.muted, ice: p.map.dot, mint: p.map.dot, fresh: p.fresh };
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
  // 처음 지도 중심과 처음 내 위치. 한 번만 정한다 — 정확한 측위가 와도 HTML을 다시 만들지 않고(재로드 없음) __setMe로 옮긴다
  const [start, setStart] = useState<{ center: LatLng; me: LatLng | null } | null>(null);
  const webViewRef = useRef<WebViewHandle>(null);
  const loadedRef = useRef(false);
  // HTML은 처음 테마로 한 번만 — 테마 전환은 __setTheme 주입(D3, 재로드 없음)
  const { initial: initialTheme, syncThemeOnLoad } = useMapTheme(webViewRef, c, dark);
  const html = useMemo(
    () => (start ? buildHtml(start.center, start.me, initialTheme.p, initialTheme.dark, tabClearance + 8) : ''),
    [start, initialTheme, tabClearance],
  );
  const [selected, setSelected] = useState<RunMarker | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // 닫기 시작한 카드의 러닝(×·빈 지도 탭). 카드는 0.24초 동안 내려가지만 지도 위 경로·빛 둘레는 이때 바로 지운다
  const [closingId, setClosingId] = useState<string | null>(null);
  const closingRef = useRef(closingId);
  closingRef.current = closingId;
  // 그 러닝이 아직 골라져 있을 때만 선택을 푼다(카드가 내려가는 사이 다른 마커를 골랐으면 그대로 둔다)
  const deselect = useCallback((id: string) => setSelected((s) => (s?._id === id ? null : s)), []);
  // 지금 아는 내 위치와, 로드 전에 온 측위로 지도를 옮겨야 하는지(onLoadEnd가 마저 한다)
  const meRef = useRef<LatLng | null>(null);
  const pendingMove = useRef(false);
  // WebView를 다시 만들 때 로드 뒤 되돌릴 화면
  const restoreView = useRef<ViewportMessage | null>(null);
  // 빈 지도 탭 횟수: 열린 카드는 이 값이 바뀌면 닫힌다(새 카드는 열릴 때의 값을 기준으로 삼는다)
  const [dismissKey, setDismissKey] = useState(0);
  const [feedState, setFeedState] = useState<FeedState>('normal');
  const [filter, setFilter] = useState<FeedFilter>('total');
  const [noMatch, setNoMatch] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [radius, setRadius] = useState<number | null>(null);
  const skipFirstFocus = useRef(true);
  const lastViewport = useRef<ViewportMessage | null>(null);
  // WebView가 죽거나 포그라운드 복귀 핑에 답이 없으면 다시 마운트한다. 페이지가 처음 viewport를 다시 보내 러닝·바탕 점은 스스로 다시 받고,
  // 보던 화면은 onLoadEnd가 되돌린다. 그려 둔 경로가 사라지므로 포스터 카드는 닫는다
  const { mapKey, handleMapMessage, crashProps } = useMapRecovery(webViewRef, loadedRef, () => {
    restoreView.current = lastViewport.current;
    setSelected(null);
  });
  const lastRuns = useRef<RunMarker[] | null>(null);
  const filterRef = useRef(filter);
  const requestSeq = useRef(0);
  // NEW(이번 주 새 길): 서버가 준 칸과 칸을 연 러닝별 km
  const newCellsRef = useRef<NewCellsResponse['cells']>([]);
  const [openerKm, setOpenerKm] = useState<Map<string, number>>(() => new Map());
  const openersRef = useRef<ReadonlySet<string>>(new Set());

  // 지금 필터에 맞는 러닝이 하나도 없는지(TOTAL은 언제나 false)
  const checkNoMatch = useCallback(() => {
    const runs = lastRuns.current ?? [];
    setNoMatch(runs.length > 0 && !runs.some((run) => matchesFilter(run, filterRef.current, openersRef.current)));
  }, []);

  // 받은 러닝을 모두 지도에 올린다. 필터는 거르지 않고 마커 강조만 바꾼다(WebView는 다시 로드하지 않는다)
  const showRuns = useCallback(() => {
    const runs = lastRuns.current;
    if (!runs) return;
    setFeedState(runs.length > 0 ? 'normal' : 'empty');
    checkNoMatch();
    webViewRef.current?.injectJavaScript(`window.__setRuns(${JSON.stringify(runs.map((run) => toMapRun(run, openersRef.current)))});true;`);
  }, [checkNoMatch]);

  const fetchRuns = useCallback(async ({ lat, lng, radius, cell }: ViewportMessage) => {
    const seq = ++requestSeq.current;
    // D3 바탕(이번 주 칸별 서로 다른 러너 수). 실패해도 러닝은 보여 주고 바탕 점만 남는다
    client.get<DensityCell[]>(`/runs/density?lat=${lat}&lng=${lng}&radius=${radius}&cell=${cell}`)
      .then((res) => {
        if (seq === requestSeq.current) webViewRef.current?.injectJavaScript(`window.__trace.setCells(${JSON.stringify(res.data)});true;`);
      })
      .catch(() => {});
    // NEW: 이번 주 새 길 칸. 실패하면 지난 값을 비운다(NEW에 아무것도 안 켜짐)
    client.get<NewCellsResponse>(`/runs/new-cells?lat=${lat}&lng=${lng}&radius=${radius}`)
      .then((res) => res.data, () => ({ cellMeters: 0, cells: [], runs: [] }))
      .then((data) => {
        if (seq !== requestSeq.current) return;
        newCellsRef.current = data.cells;
        openersRef.current = new Set(data.runs.map((r) => r.runId));
        setOpenerKm(new Map(data.runs.map((r) => [r.runId, r.km])));
        webViewRef.current?.injectJavaScript(`window.__trace.setNew(${JSON.stringify(data.cells)},${filterRef.current === 'new'},${data.cellMeters});true;`);
        showRuns();
      });
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
    webViewRef.current?.injectJavaScript(`window.__setMode&&window.__setMode(${JSON.stringify(filter)});window.__trace&&window.__trace.setNew(${JSON.stringify(newCellsRef.current)},${filter === 'new'});true;`);
  }, [filter, checkNoMatch]);

  // 내 위치 점을 옮긴다(move면 지도도). 로드 전이면 onLoadEnd가 마저 한다. 고른 러닝이 있으면 지도는 옮기지 않는다
  const placeMe = useCallback((pos: LatLng, move: boolean) => {
    meRef.current = pos;
    if (!loadedRef.current) {
      pendingMove.current = pendingMove.current || move;
      return;
    }
    webViewRef.current?.injectJavaScript(`window.__setMe(${pos.lat},${pos.lng},${move && !selectedRef.current});true;`);
  }, []);

  // 지도는 GPS 측위를 기다리지 않고 바로 띄운다: 마지막으로 알려진 위치 → 지난번 지도 중심 → 서울.
  // 정확한 측위(Balanced)는 뒤에서 받아 4초 안이면 지도를 옮기고, 늦으면 내 위치 점만 옮긴다. 권한이 없으면 지금처럼 서울
  useEffect(() => {
    let alive = true;
    (async () => {
      let granted = false;
      try {
        granted = (await Location.requestForegroundPermissionsAsync()).status === 'granted';
      } catch {}
      if (!alive) return;
      if (!granted) {
        setStart({ center: SEOUL, me: SEOUL });
        return;
      }
      const askedAt = Date.now();
      // Android: 위치 설정이 꺼져 있어도 시작 때 시스템 대화상자를 띄우지 않는다(취소하면 측위가 실패한다)
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false })
        .then((pos) => {
          if (alive) placeMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }, Date.now() - askedAt < FIX_TIMEOUT_MS);
        })
        .catch(() => {});
      const [last, saved] = await Promise.all([
        within(Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }), QUICK_WAIT_MS),
        within(SecureStorage.getItem(CENTER_KEY).then(parseCenter), QUICK_WAIT_MS),
      ]);
      if (!alive) return;
      const me = last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
      // 측위가 이미 왔으면 그 위치로 연다
      const known = meRef.current ?? me;
      if (meRef.current) pendingMove.current = false;
      setStart({ center: known ?? saved ?? SEOUL, me: known });
    })();
    return () => { alive = false; };
  }, [placeMe]);

  // 다음 실행의 시작 중심: 앱이 백그라운드로 갈 때 한 번 저장(약 100m 단위)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const v = lastViewport.current;
      if (state !== 'background' || !v) return;
      const round = (n: number) => Math.round(n * 1000) / 1000;
      SecureStorage.setItem(CENTER_KEY, JSON.stringify({ lat: round(v.lat), lng: round(v.lng) })).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    if (lastViewport.current) fetchRuns(lastViewport.current);
  }, [fetchRuns]));

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      meRef.current = { lat: latitude, lng: longitude };
      webViewRef.current?.injectJavaScript(`window.__setMe(${latitude},${longitude},false);map.flyTo([${latitude},${longitude}],Math.max(map.getZoom(),13));true;`);
    } catch {}
  }, []);

  // 마커를 고르면 그 기록의 경로를 받는다(목록 응답에는 경로가 없다). 남의 러닝은 서버가 집 근처를 잘라 보낸다
  const cardBottom = tabClearance + 12;
  const myId = useAuthStore((s) => s.user?._id);
  const [selectedRoute, setSelectedRoute] = useState<{ id: string; coords: LngLat[] } | null>(null);
  useEffect(() => {
    setSelectedRoute(null);
    if (!selected) return;
    let cancelled = false;
    client.get<RunDetailResponse>(`/runs/${selected._id}`)
      .then((res) => {
        // 받는 사이 선택이 바뀌었거나 카드를 닫기 시작했으면 경로도 카메라도 건드리지 않는다
        if (cancelled || closingRef.current === selected._id) return;
        const coords = res.data.route?.coordinates ?? [];
        setSelectedRoute({ id: selected._id, coords });
        const pad = [headerHeight + 16, cardBottom + POSTER_HEIGHT + 24];
        webViewRef.current?.injectJavaScript(`window.__fitRoute(${JSON.stringify(coords)},${JSON.stringify(pad)});true;`);
      })
      // 못 받으면 경로 없이(바꾸기 전 러닝의 경로가 남지 않게 지운다)
      .catch(() => { if (!cancelled) setSelectedRoute({ id: selected._id, coords: [] }); });
    return () => { cancelled = true; };
    // 헤더 높이가 바뀌어도 다시 받지 않는다
  }, [selected]);

  // 경로 연출 A+: 처음엔 그리며 재생, 필터·테마만 바뀌면 끝 상태로 색만 바꾼다
  const drawnId = useRef<string | null>(null);
  const routeColor = selected
    // 렌즈에 걸린 러닝은 경로 전체를 처음부터 그 색으로: HYPE 러닝 Pearl · NEW(이번 주 새 길을 연) 러닝 민트
    ? filter === 'hype' && isHype(selected) ? c.hype : filter === 'new' && openerKm.has(selected._id) ? c.fresh : c.map.dot
    : c.map.dot;
  const mine = !!selected && selected.userId._id === myId;
  // 지도 위 경로를 그리고 지우는 곳은 여기 하나. 선택을 풀 때 같은 렌더에 mine·routeColor가 바뀌어도 앞 경로를 다시 그리지 않는다
  const draw = routeDraw(selected?._id, closingId, selectedRoute);
  useEffect(() => {
    if (draw === 'wait') { drawnId.current = null; return; }
    if (draw === 'clear') {
      drawnId.current = null;
      webViewRef.current?.injectJavaScript('window.__routeFx&&window.__routeFx.clear();true;');
      return;
    }
    // 그리는 사본(경로 선 v2 매끈하게). 집 근처 나누기 · km 자리는 원래 좌표로 정한 그대로
    const geometry = smoothGeometry(routeGeometry(draw.coords, mine));
    const options: RouteFxOptions = {
      ...routeFxTone(c, routeColor), glass: c.glass, glassBorder: c.glassBorder, text: c.text, text2: c.text2,
      label: mine ? HOME_LABEL : null,
      delay: ROUTE_DELAY_MS,
      keep: drawnId.current === draw.id,
      seed: seedOf(draw.id),
    };
    drawnId.current = draw.id;
    webViewRef.current?.injectJavaScript(`window.__routeFx.show(${JSON.stringify(geometry)},${JSON.stringify(options)});true;`);
  }, [draw, routeColor, mine, c]);

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
    webViewRef.current?.injectJavaScript(`window.__updateRun(${JSON.stringify(toMapRun(next, openersRef.current))});true;`);
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
        key={mapKey}
        ref={webViewRef}
        source={{ html }}
        style={StyleSheet.absoluteFill}
        originWhitelist={['*']}
        javaScriptEnabled
        startInLoadingState
        {...crashProps}
        onLoadStart={() => { loadedRef.current = false; }}
        onLoadEnd={() => {
          loadedRef.current = true;
          // 로드 중에 테마가 바뀌었을 때만 다시 칠한다(D3 바탕 색도 함께)
          if (syncThemeOnLoad()) {
            webViewRef.current?.injectJavaScript(`window.__trace.setColors(${JSON.stringify(feedTraceColors(c))});true;`);
          }
          // 다시 마운트했으면 보던 화면·필터로, 로드 전에 측위가 왔으면 내 위치 점(과 지도)을 옮긴다
          const restore = restoreView.current;
          const me = meRef.current;
          const move = pendingMove.current && !restore && !selectedRef.current;
          restoreView.current = null;
          pendingMove.current = false;
          let js = '';
          if (restore) js += `map.setView([${restore.lat},${restore.lng}],${restore.zoom},{animate:false});`;
          if (filterRef.current !== 'total') js += `window.__setMode(${JSON.stringify(filterRef.current)});`;
          if (me) js += `window.__setMe(${me.lat},${me.lng},${move});`;
          if (js) webViewRef.current?.injectJavaScript(`${js}true;`);
        }}
        onMessage={(e) => {
          try {
            const message = JSON.parse(e.nativeEvent.data) as ViewportMessage | RunMessage | MapTapMessage | MapPageMessage;
            if (handleMapMessage(message)) return;
            if (message.type === 'viewport') {
              lastViewport.current = message;
              setRadius(message.radius);
              fetchRuns(message);
            } else if (message.type === 'mapTap') {
              setDismissKey((k) => k + 1);
            } else if (message.type === 'run') {
              setClosingId(null);
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
              {feedState === 'error' ? '불러오지 못했어요' : '아직 아무도 안 달린 동네예요'}
            </Text>
            {feedState === 'empty' && <Text style={styles.noticeSub}>제일 먼저 달려 보세요</Text>}
          </View>
          {feedState === 'error' ? (
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retryBtn}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/record')} style={styles.retryBtn}>
              <Text style={styles.retryText}>달리러 가기</Text>
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
          newKm={filter === 'new' ? openerKm.get(selected._id) : undefined}
          onCloseStart={() => setClosingId(selected._id)}
          onClose={() => deselect(selected._id)}
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
