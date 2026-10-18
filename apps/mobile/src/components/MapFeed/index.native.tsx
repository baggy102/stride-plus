import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text } from 'react-native';
import { Wordmark } from '@/components/Wordmark';
import { LocateIcon, RouteIcon, AlertIcon } from '@/components/icons';
import { useTabBarClearance } from '@/components/FloatingTabBar';
import { FONT } from '@/theme/fonts';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MapPopupCard } from '@/components/MapPopupCard';
import client, { BASE_URL } from '@/api/client';
import { CARTO_TILE_URL, CARTO_ATTRIBUTION } from '@/config/mapTiles';
import { useColors, useScheme } from '@/theme/useColors';
import { withAlpha, type Palette } from '@/theme/colors';
import { RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };

// 서버 FindRunsDto의 radius 상한과 같다.
const MAX_RADIUS_M = 300000;

type ViewportMessage = { type: 'viewport'; lat: number; lng: number; radius: number };
type RunMessage = { type: 'run'; run: RunMarker };

// bottomOffset: 탭바에 가리지 않게 Leaflet 출처 표기를 올리는 높이
function buildHtml(lat: number, lng: number, p: Palette, dark: boolean, bottomOffset: number) {
  const m = p.map;
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js"></script>
  <style>
    * { margin:0; padding:0; }
    body { background: ${m.bg}; }
    #map { width:100vw; height:100vh; }
    .map-tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(1.6) contrast(0.8) saturate(0.5) !important; }
    .leaflet-bottom { bottom: ${bottomOffset}px !important; }
    @keyframes runDotPulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(2.6); opacity: 0; }
    }
    .run-dot-pulse { animation: runDotPulse 2s ease-out infinite; }
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map',{zoomControl:false}).setView([${lat},${lng}],13);
  L.tileLayer('${CARTO_TILE_URL}',{attribution:'${CARTO_ATTRIBUTION}',className:'${dark ? 'map-tiles-dark' : ''}'}).addTo(map);
  L.circleMarker([${lat},${lng}],{radius:9,color:'${m.meRing}',fillColor:'${m.meFill}',fillOpacity:1,weight:3}).addTo(map);

  var dotIcon=L.divIcon({html:'<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div class="run-dot-pulse" style="position:absolute;inset:0;border-radius:50%;background:${m.pulse}"></div><div style="width:11px;height:11px;border-radius:50%;background:${m.dot};border:2px solid ${m.dotBorder};box-shadow:0 0 8px ${withAlpha(m.dot, 0.7)}"></div></div>',className:'',iconSize:[22,22],iconAnchor:[11,11]});
  function clusterIcon(c){var n=c.getChildCount();return L.divIcon({html:'<div style="width:48px;height:48px;border-radius:50%;background:${m.clBg};color:${m.clRing};border:2px solid ${m.clRing};box-shadow:0 0 14px ${m.clGlow},0 0 4px ${withAlpha(m.clRing, 0.25)};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:-0.5px;font-family:system-ui">+'+n+'</div>',className:'',iconSize:[48,48],iconAnchor:[24,24]});}

  var group=L.markerClusterGroup({iconCreateFunction:clusterIcon,showCoverageOnHover:false,maxClusterRadius:60});
  map.addLayer(group);

  window.__setRuns=function(runs){
    group.clearLayers();
    runs.forEach(function(run){
      if(!run.startPoint)return;
      var m=L.marker([run.startPoint[1],run.startPoint[0]],{icon:dotIcon});
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

// 피드 필터 칩: 러닝 거리 구간(겹치지 않음) — 5km 이하 / 5~10km / 10km 초과 (2026-10-18 결정)
const CHIPS = [
  { label: '전체', overKm: -1, upToKm: Infinity },
  { label: '5km', overKm: -1, upToKm: 5 },
  { label: '10km', overKm: 5, upToKm: 10 },
  { label: '10km+', overKm: 10, upToKm: Infinity },
] as const;

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
  // 테마가 바뀌면 지도를 다시 그린다(재로드 없는 전환은 D2 __setTheme)
  const html = useMemo(
    () => (center ? buildHtml(center.lat, center.lng, c, dark, tabClearance + 8) : ''),
    [center, c, dark, tabClearance],
  );
  const [selected, setSelected] = useState<RunMarker | null>(null);
  const [feedState, setFeedState] = useState<FeedState>('normal');
  const [chipIndex, setChipIndex] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const webViewRef = useRef<WebView>(null);
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
        style={StyleSheet.absoluteFillObject}
        originWhitelist={['*']}
        javaScriptEnabled
        startInLoadingState
        onMessage={(e) => {
          try {
            const message = JSON.parse(e.nativeEvent.data) as ViewportMessage | RunMessage;
            if (message.type === 'viewport') {
              lastViewport.current = message;
              fetchRuns(message);
            } else {
              setSelected(message.run);
            }
          } catch {}
        }}
      />

      {/* 헤더: 워드마크 + 거리 필터 칩 */}
      <View
        style={[styles.header, { paddingTop: insets.top + 8 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.logoRow}>
          <Wordmark width={71} />
        </View>
        <View style={styles.chips}>
          {CHIPS.map((chip, index) => {
            const on = index === chipIndex;
            return (
              <Pressable
                key={chip.label}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setChipIndex(index)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 빈 상태 · 조회 실패 */}
      {feedState !== 'normal' && headerHeight > 0 && (
        <View
          accessibilityRole={feedState === 'error' ? 'alert' : 'summary'}
          style={[styles.notice, { top: headerHeight + 12 }]}
        >
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
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="내 위치로 이동"
        style={[styles.myLocBtn, { bottom: tabClearance + 16 }]}
        onPress={handleMyLocation}
      >
        <LocateIcon color={c.value} />
      </Pressable>

      {selected && (
        <MapPopupCard
          run={selected}
          baseUrl={BASE_URL}
          bottom={tabClearance + 12}
          onClose={() => setSelected(null)}
          onUserPress={(userId) => {
            setSelected(null);
            router.push(`/user/${userId}`);
          }}
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
    backgroundColor: c.header,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  logoRow: { alignItems: 'center', marginVertical: 6 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 10 },
  chip: {
    height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center',
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
  },
  chipOn: { borderColor: c.accent, backgroundColor: c.accent },
  chipText: { fontFamily: FONT.semibold, fontSize: 13, color: c.text2 },
  chipTextOn: { fontFamily: FONT.bold, color: c.ink },
  notice: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: 16,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    shadowColor: c.shadow, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
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
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  retryText: { fontFamily: FONT.semibold, fontSize: 14, color: c.text },
  myLocBtn: {
    position: 'absolute', right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
    shadowColor: c.shadow, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
});
