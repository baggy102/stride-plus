import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppLogo } from '@/components/AppLogo';
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

function buildHtml(lat: number, lng: number, p: Palette, dark: boolean) {
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
    .leaflet-top.leaflet-left { top: 90px !important; }
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
  var map = L.map('map',{zoomControl:true}).setView([${lat},${lng}],13);
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

export function MapFeed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const dark = useScheme() === 'dark';
  const styles = useMemo(() => makeStyles(c), [c]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  // 테마가 바뀌면 지도를 다시 그린다(재로드 없는 전환은 D2 __setTheme)
  const html = useMemo(() => (center ? buildHtml(center.lat, center.lng, c, dark) : ''), [center, c, dark]);
  const [selected, setSelected] = useState<RunMarker | null>(null);
  const webViewRef = useRef<WebView>(null);
  const skipFirstFocus = useRef(true);
  const lastViewport = useRef<ViewportMessage | null>(null);
  const requestSeq = useRef(0);

  // WebView는 한 번만 로드하고, 마커는 __setRuns로만 갈아 끼운다.
  const fetchRuns = useCallback(async ({ lat, lng, radius }: ViewportMessage) => {
    const seq = ++requestSeq.current;
    try {
      const res = await client.get<RunMarker[]>(`/runs?lat=${lat}&lng=${lng}&radius=${radius}`);
      // 늦게 도착한 이전 요청의 응답은 버린다
      if (seq !== requestSeq.current) return;
      webViewRef.current?.injectJavaScript(`window.__setRuns(${JSON.stringify(res.data)});true;`);
    } catch {}
  }, []);

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

      {/* 헤더 오버레이 */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <AppLogo />
      </View>

      <Pressable style={styles.myLocBtn} onPress={handleMyLocation}>
        <Text style={styles.myLocTxt}>📍</Text>
      </Pressable>

      {selected && (
        <MapPopupCard
          run={selected}
          baseUrl={BASE_URL}
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
  container: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: c.header,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  myLocBtn: {
    position: 'absolute', bottom: 100, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border,
    shadowColor: c.shadow, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  myLocTxt: { fontSize: 20 },
});
