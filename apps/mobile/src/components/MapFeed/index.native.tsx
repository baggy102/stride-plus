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
import { MapPopupCard } from '@/components/MapPopupCard';
import client, { BASE_URL } from '@/api/client';
import { useColors, useScheme } from '@/theme/useColors';
import { elevationStyle, type Palette } from '@/theme/colors';
import { baseMapScript, leafletHead, markerIconsScript, MARKER_PULSE_CSS, useMapTheme, type WebViewHandle } from '@/components/map/mapHtml';
import { RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };

// 서버 FindRunsDto의 radius 상한과 같다.
const MAX_RADIUS_M = 300000;

type ViewportMessage = { type: 'viewport'; lat: number; lng: number; radius: number };
type RunMessage = { type: 'run'; run: RunMarker };
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

  var group=L.markerClusterGroup({iconCreateFunction:clusterIcon,showCoverageOnHover:false,maxClusterRadius:60});
  map.addLayer(group);

  var lastRuns=[];
  // 선택한 기록(S05)의 경로만 그린다: 다크는 옅은 번짐 + 바탕색 테두리(8) + 경로(4) + 시작점
  var selGlow=L.polyline([],{weight:12,opacity:0,lineCap:'round',lineJoin:'round',interactive:false}).addTo(map);
  var selEdge=L.polyline([],{weight:8,opacity:0.9,lineCap:'round',lineJoin:'round',interactive:false}).addTo(map);
  var selLine=L.polyline([],{weight:4,lineCap:'round',lineJoin:'round',interactive:false}).addTo(map);
  var selStart=L.circleMarker([0,0],{radius:5,weight:2.5,fillOpacity:1,interactive:false});
  function styleSelected(c){
    selGlow.setStyle({color:c.dot,opacity:c.dark?0.25:0});
    selEdge.setStyle({color:c.ring});
    selLine.setStyle({color:c.dot});
    selStart.setStyle({color:c.dot,fillColor:c.ring});
  }
  styleSelected(iconColors);
  // coords: [lng,lat][] (없으면 지운다). pad: 헤더·카드에 가리지 않게 둘 여백 [위, 아래]
  window.__setSelected=function(coords,pad){
    var pts=(coords||[]).map(function(c){return [c[1],c[0]];});
    selGlow.setLatLngs(pts);selEdge.setLatLngs(pts);selLine.setLatLngs(pts);
    if(pts.length>0){
      selStart.setLatLng(pts[0]).addTo(map);
      if(pts.length>1)map.fitBounds(L.latLngBounds(pts),{paddingTopLeft:[32,pad[0]],paddingBottomRight:[32,pad[1]],maxZoom:16});
    }else{map.removeLayer(selStart);}
  };

  // 테마 전환: 마커 아이콘과 내 위치·선택 경로 색을 바꾸고 지금 러닝을 다시 그린다
  window.__onTheme=function(c){
    makeIcons(c);
    me.setStyle({color:c.meRing,fillColor:c.meFill});
    meHalo.setStyle({fillColor:c.meHalo});
    styleSelected(c);
    window.__setRuns(lastRuns);
  };

  window.__setRuns=function(runs){
    lastRuns=runs;
    group.clearLayers();
    runs.forEach(function(run){
      if(!run.startPoint)return;
      var m=L.marker([run.startPoint[1],run.startPoint[0]],{icon:ringIcon});
      m.on('click',function(){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'run',run:run}));
      });
      group.addLayer(m);
    });
  };

  function reportViewport(){
    var c=map.getCenter();
    var r=Math.min(Math.ceil(c.distanceTo(map.getBounds().getNorthEast())),${MAX_RADIUS_M});
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'viewport',lat:c.lat,lng:c.lng,radius:r}));
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

// 피드 필터 칩: 러닝 거리 구간(겹치지 않음) — 5km 이하 / 5~10km / 10km 초과 (2026-10-18 결정).
// Frost: 거리 칩 라벨은 모노(5K·10K·10K+)
const CHIPS = [
  { label: '전체', a11y: '전체', overKm: -1, upToKm: Infinity },
  { label: '5K', a11y: '5킬로미터 이하', overKm: -1, upToKm: 5 },
  { label: '10K', a11y: '5에서 10킬로미터', overKm: 5, upToKm: 10 },
  { label: '10K+', a11y: '10킬로미터 초과', overKm: 10, upToKm: Infinity },
] as const;

// 「NEARBY 2 KM」: 지금 보이는 지도 반경(1 km 단위, 최소 1)
function nearbyLabel(radiusM: number | null) {
  if (!radiusM) return null;
  return `NEARBY ${Math.max(1, Math.round(radiusM / 1000))} KM`;
}

const CARD_HEIGHT = 152;

function inChip(distanceKm: number, chip: (typeof CHIPS)[number]) {
  return distanceKm > chip.overKm && distanceKm <= chip.upToKm;
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
  const [feedState, setFeedState] = useState<FeedState>('normal');
  const [chipIndex, setChipIndex] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [radius, setRadius] = useState<number | null>(null);
  const skipFirstFocus = useRef(true);
  const lastViewport = useRef<ViewportMessage | null>(null);
  const lastRuns = useRef<RunMarker[] | null>(null);
  const chipRef = useRef(chipIndex);
  const requestSeq = useRef(0);

  // 마지막으로 받은 런을 칩 조건으로 걸러 지도에 반영한다(WebView는 다시 로드하지 않는다)
  const showRuns = useCallback((index: number) => {
    const runs = lastRuns.current;
    if (!runs) return;
    const visible = runs.filter((run) => inChip(run.distanceKm, CHIPS[index]));
    setFeedState(visible.length > 0 ? 'normal' : 'empty');
    webViewRef.current?.injectJavaScript(`window.__setRuns(${JSON.stringify(visible)});true;`);
  }, []);

  const fetchRuns = useCallback(async ({ lat, lng, radius }: ViewportMessage) => {
    const seq = ++requestSeq.current;
    try {
      const res = await client.get<RunMarker[]>(`/runs?lat=${lat}&lng=${lng}&radius=${radius}`);
      // 늦게 도착한 이전 요청의 응답은 버린다
      if (seq !== requestSeq.current) return;
      lastRuns.current = res.data;
      showRuns(chipRef.current);
    } catch {
      if (seq === requestSeq.current) setFeedState('error');
    }
  }, [showRuns]);

  useEffect(() => {
    chipRef.current = chipIndex;
    showRuns(chipIndex);
  }, [chipIndex, showRuns]);

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
      webViewRef.current?.injectJavaScript(`map.flyTo([${latitude},${longitude}],14);true;`);
    } catch {}
  }, []);

  // 마커를 고르면 그 기록의 경로를 받아 지도에 그린다(목록 응답에는 경로가 없다)
  const cardBottom = tabClearance + 12;
  useEffect(() => {
    const clear = () => webViewRef.current?.injectJavaScript('window.__setSelected&&window.__setSelected(null,[0,0]);true;');
    if (!selected) { clear(); return; }
    let cancelled = false;
    client.get<RunDetailResponse>(`/runs/${selected._id}`)
      .then((res) => {
        if (cancelled) return;
        const coords = res.data.route?.coordinates ?? [];
        const pad = [headerHeight + 16, cardBottom + CARD_HEIGHT + 24];
        webViewRef.current?.injectJavaScript(`window.__setSelected(${JSON.stringify(coords)},${JSON.stringify(pad)});true;`);
      })
      .catch(() => { if (!cancelled) clear(); });
    return () => { cancelled = true; };
  }, [selected, headerHeight, cardBottom]);

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
        onLoadEnd={applyTheme}
        onMessage={(e) => {
          try {
            const message = JSON.parse(e.nativeEvent.data) as ViewportMessage | RunMessage;
            if (message.type === 'viewport') {
              lastViewport.current = message;
              setRadius(message.radius);
              fetchRuns(message);
            } else {
              setSelected(message.run);
            }
          } catch {}
        }}
      />

      {/* 헤더: 세로 페이드 위 워드마크(+ NEARBY 반경) + 거리 필터 칩 */}
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
        <View style={styles.chips}>
          {CHIPS.map((chip, index) => {
            const on = index === chipIndex;
            const label = (
              <Text style={[styles.chipText, index > 0 && styles.chipMono, on && styles.chipTextOn]}>{chip.label}</Text>
            );
            return (
              <Pressable
                key={chip.label}
                accessibilityRole="button"
                accessibilityLabel={chip.a11y}
                accessibilityState={{ selected: on }}
                onPress={() => setChipIndex(index)}
              >
                {on ? <View style={[styles.chip, styles.chipOn]}>{label}</View> : <Glass style={styles.chip}>{label}</Glass>}
              </Pressable>
            );
          })}
        </View>
      </View>

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
        style={[styles.myLocShadow, { bottom: (selected ? cardBottom + CARD_HEIGHT : tabClearance) + 12 }]}
        onPress={handleMyLocation}
      >
        <Glass style={styles.myLocBtn}>
          <LocateIcon color={c.text} />
        </Glass>
      </Pressable>

      {selected && (
        <MapPopupCard
          run={selected}
          baseUrl={BASE_URL}
          bottom={cardBottom}
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
  chips: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: { height: 36, paddingHorizontal: 15, borderRadius: 18, justifyContent: 'center' },
  chipOn: { backgroundColor: c.chipOnBg, borderWidth: 1, borderColor: c.chipOnBg },
  chipText: { fontFamily: FONT.semibold, fontSize: 13, color: c.text },
  chipMono: { ...monoLabel(13, 0.08) },
  chipTextOn: { color: c.chipOnFg },
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
