import { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppLogo } from '@/components/AppLogo';
import client, { BASE_URL } from '@/api/client';
import { LEAFLET_HEAD, popupInnerHtml } from '@/utils/mapHtml';
import { RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };

function buildHtml(lat: number, lng: number, runs: RunMarker[], baseUrl: string) {
  const runsJson = JSON.stringify(runs);
  const popups = runs.reduce<Record<string, string>>((acc, run) => {
    acc[run._id] = popupInnerHtml(run, baseUrl, true);
    return acc;
  }, {});
  const popupsJson = JSON.stringify(popups);

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  ${LEAFLET_HEAD}
  <style>
    body { background: #0A0A0A; }
    .map-tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(1.6) contrast(0.8) saturate(0.5) !important; }
    .leaflet-top.leaflet-left { top: 90px !important; }
    .leaflet-popup-content-wrapper {
      background: #141414 !important;
      border: 1px solid #1F1F1F !important;
      border-radius: 12px !important;
      box-shadow: 0 4px 24px rgba(0,0,0,0.7) !important;
      color: #F5F5F5 !important;
    }
    .leaflet-popup-tip { background: #141414 !important; }
    .leaflet-popup-content { margin: 12px !important; }
    @keyframes runDotPulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(2.6); opacity: 0; }
    }
    .run-dot-pulse { animation: runDotPulse 2s ease-out infinite; }
  </style>
</head>
<body>
<div id="map"></div>
<div id="card" style="display:none;position:fixed;bottom:16px;left:12px;right:12px;background:#141414;border:1px solid #1F1F1F;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.7);overflow:hidden;z-index:9999;"></div>
<script>
  var map = L.map('map',{zoomControl:true}).setView([${lat},${lng}],13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OSM © CARTO',className:'map-tiles-dark'}).addTo(map);
  L.circleMarker([${lat},${lng}],{radius:9,color:'#B3E5FC',fillColor:'#ffffff',fillOpacity:1,weight:3}).addTo(map);

  var dotIcon=L.divIcon({html:'<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div class="run-dot-pulse" style="position:absolute;inset:0;border-radius:50%;background:rgba(179,229,252,0.25)"></div><div style="width:11px;height:11px;border-radius:50%;background:#B3E5FC;border:2px solid #0A0A0A;box-shadow:0 0 8px rgba(179,229,252,0.7)"></div></div>',className:'',iconSize:[22,22],iconAnchor:[11,11]});
  function clusterIcon(c){var n=c.getChildCount();return L.divIcon({html:'<div style="width:48px;height:48px;border-radius:50%;background:#0A0A0A;color:#B3E5FC;border:2px solid #B3E5FC;box-shadow:0 0 14px rgba(179,229,252,0.5),0 0 4px rgba(179,229,252,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:-0.5px;font-family:system-ui">+'+n+'</div>',className:'',iconSize:[48,48],iconAnchor:[24,24]});}

  var group=L.markerClusterGroup({iconCreateFunction:clusterIcon,showCoverageOnHover:false,maxClusterRadius:60});
  var runs=${runsJson};
  var popups=${popupsJson};
  var card=document.getElementById('card');

  runs.forEach(function(run){
    if(!run.startPoint)return;
    var m=L.marker([run.startPoint[1],run.startPoint[0]],{icon:dotIcon});
    m.on('click',function(){
      card.innerHTML='<div onclick="card.style.display=\\'none\\'" style="position:absolute;top:10px;right:12px;font-size:18px;color:#71717a;cursor:pointer;z-index:1;">✕</div>'+(popups[run._id]||'');
      card.style.display='block';
      window.ReactNativeWebView.postMessage(JSON.stringify(run));
    });
    group.addLayer(m);
  });
  map.addLayer(group);
  map.on('click',function(){card.style.display='none';});
</script>
</body>
</html>`;
}

export function MapFeed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loc, setLoc] = useState(SEOUL);
  const [runs, setRuns] = useState<RunMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState('');
  const webViewRef = useRef<WebView>(null);
  const skipFirstFocus = useRef(true);

  const fetchRuns = useCallback(async (lat: number, lng: number) => {
    try {
      const { data } = await client.get<RunMarker[]>(`/runs?lat=${lat}&lng=${lng}&radius=15000`);
      setRuns(data);
      setHtml(buildHtml(lat, lng, data, BASE_URL));
    } catch {}
    finally { setLoading(false); }
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
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'profile' && msg.userId) router.push(`/user/${msg.userId}`);
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
