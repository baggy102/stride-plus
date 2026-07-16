import { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppLogo } from '@/components/AppLogo';
import { MapPopupCard } from '@/components/MapPopupCard';
import client, { BASE_URL } from '@/api/client';
import { RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };

function buildHtml(lat: number, lng: number, runs: RunMarker[]) {
  const runsJson = JSON.stringify(runs);

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
    body { background: #0A0A0A; }
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
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OSM © CARTO',className:'map-tiles-dark'}).addTo(map);
  L.circleMarker([${lat},${lng}],{radius:9,color:'#B3E5FC',fillColor:'#ffffff',fillOpacity:1,weight:3}).addTo(map);

  var dotIcon=L.divIcon({html:'<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div class="run-dot-pulse" style="position:absolute;inset:0;border-radius:50%;background:rgba(179,229,252,0.25)"></div><div style="width:11px;height:11px;border-radius:50%;background:#B3E5FC;border:2px solid #0A0A0A;box-shadow:0 0 8px rgba(179,229,252,0.7)"></div></div>',className:'',iconSize:[22,22],iconAnchor:[11,11]});
  function clusterIcon(c){var n=c.getChildCount();return L.divIcon({html:'<div style="width:48px;height:48px;border-radius:50%;background:#0A0A0A;color:#B3E5FC;border:2px solid #B3E5FC;box-shadow:0 0 14px rgba(179,229,252,0.5),0 0 4px rgba(179,229,252,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:-0.5px;font-family:system-ui">+'+n+'</div>',className:'',iconSize:[48,48],iconAnchor:[24,24]});}

  var group=L.markerClusterGroup({iconCreateFunction:clusterIcon,showCoverageOnHover:false,maxClusterRadius:60});
  var runs=${runsJson};

  runs.forEach(function(run){
    if(!run.startPoint)return;
    var m=L.marker([run.startPoint[1],run.startPoint[0]],{icon:dotIcon});
    m.on('click',function(){
      window.ReactNativeWebView.postMessage(JSON.stringify(run));
    });
    group.addLayer(m);
  });
  map.addLayer(group);
</script>
</body>
</html>`;
}

export function MapFeed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loc, setLoc] = useState(SEOUL);
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState('');
  const [selected, setSelected] = useState<RunMarker | null>(null);
  const webViewRef = useRef<WebView>(null);
  const skipFirstFocus = useRef(true);

  const fetchRuns = useCallback(async (lat: number, lng: number) => {
    let data: RunMarker[] = [];
    try {
      const res = await client.get<RunMarker[]>(`/runs?lat=${lat}&lng=${lng}&radius=15000`);
      data = res.data;
    } catch {}
    // 마커 조회가 실패해도 지도 자체는 항상 렌더링되도록 보장
    setHtml(buildHtml(lat, lng, data));
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        const { latitude: lat, longitude: lng } = pos.coords;
        setLoc({ lat, lng });
        fetchRuns(lat, lng);
      } else {
        fetchRuns(SEOUL.lat, SEOUL.lng);
      }
    })();
  }, [fetchRuns]);

  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    fetchRuns(loc.lat, loc.lng);
  }, [fetchRuns, loc]));

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webViewRef.current?.injectJavaScript(`map.flyTo([${latitude},${longitude}],14);true;`);
    } catch {}
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#B3E5FC" size="large" />
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
            setSelected(JSON.parse(e.nativeEvent.data));
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderBottomWidth: 1, borderBottomColor: '#1F1F1F',
  },
  myLocBtn: {
    position: 'absolute', bottom: 100, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1F1F1F',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  myLocTxt: { fontSize: 20 },
});
