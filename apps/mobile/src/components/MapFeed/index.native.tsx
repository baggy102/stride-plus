import { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
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
</head>
<body>
<div id="map"></div>
<div id="card" style="display:none;position:fixed;bottom:16px;left:12px;right:12px;background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.18);overflow:hidden;z-index:9999;"></div>
<script>
  var map = L.map('map',{zoomControl:true}).setView([${lat},${lng}],13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'© OSM © CARTO'}).addTo(map);
  L.circleMarker([${lat},${lng}],{radius:9,color:'#3b82f6',fillColor:'#3b82f6',fillOpacity:1,weight:3}).addTo(map);

  var dotIcon=L.divIcon({html:'<div style="width:13px;height:13px;border-radius:50%;background:#e53935;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>',className:'',iconSize:[13,13],iconAnchor:[6,6]});
  function clusterIcon(c){var n=c.getChildCount();return L.divIcon({html:'<div style="width:44px;height:44px;border-radius:22px;background:rgba(229,57,53,.88);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.22)">+'+n+'</div>',className:'',iconSize:[44,44],iconAnchor:[22,22]});}

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
        <ActivityIndicator color="#e53935" size="large" />
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
        onMessage={() => {}}
      />
      <Pressable style={styles.myLocBtn} onPress={handleMyLocation}>
        <Text style={styles.myLocTxt}>📍</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  myLocBtn: {
    position: 'absolute', bottom: 100, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  myLocTxt: { fontSize: 20 },
});
