import { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };

function formatPace(sec: number) {
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function buildHtml(lat: number, lng: number, runs: RunMarker[], baseUrl: string) {
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
  <style>* { margin:0; padding:0; } #map { width:100vw; height:100vh; }</style>
</head>
<body>
<div id="map"></div>
<script>
  const map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OSM © CARTO'
  }).addTo(map);

  L.circleMarker([${lat}, ${lng}], {
    radius: 9, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1, weight: 3
  }).addTo(map);

  const dotIcon = L.divIcon({
    html: '<div style="width:13px;height:13px;border-radius:50%;background:#e53935;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>',
    className: '', iconSize: [13,13], iconAnchor: [6,6],
  });

  function clusterIcon(cluster) {
    const n = cluster.getChildCount();
    return L.divIcon({
      html: '<div style="width:44px;height:44px;border-radius:22px;background:rgba(229,57,53,0.88);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.22)">+' + n + '</div>',
      className: '', iconSize: [44,44], iconAnchor: [22,22],
    });
  }

  const group = L.markerClusterGroup({ iconCreateFunction: clusterIcon, showCoverageOnHover: false, maxClusterRadius: 60 });
  const runs = ${runsJson};

  runs.forEach(function(run) {
    if (!run.startPoint) return;
    const m = L.marker([run.startPoint[1], run.startPoint[0]], { icon: dotIcon });
    m.on('click', function() {
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
  const [loc, setLoc] = useState(SEOUL);
  const [runs, setRuns] = useState<RunMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RunMarker | null>(null);
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

  // 최초 마운트: 내 위치 확보 후 fetch
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

  // 탭 재진입 시 리페치
  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    fetchRuns(loc.lat, loc.lng);
  }, [fetchRuns, loc]));

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webViewRef.current?.injectJavaScript(`map.flyTo([${latitude}, ${longitude}], 14); true;`);
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
        onMessage={(e) => {
          try { setSelected(JSON.parse(e.nativeEvent.data)); } catch {}
        }}
      />
      <Pressable style={styles.myLocBtn} onPress={handleMyLocation}>
        <Text style={styles.myLocTxt}>📍</Text>
      </Pressable>

      {selected && (
        <View style={styles.card}>
          <Pressable style={styles.closeBtn} onPress={() => setSelected(null)}>
            <Text style={styles.closeTxt}>✕</Text>
          </Pressable>
          {selected.thumbnailUrl && (
            <Image
              source={{ uri: `${BASE_URL}${selected.thumbnailUrl}` }}
              style={styles.thumb}
              resizeMode="cover"
            />
          )}
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>
                {(selected.userId?.username ?? '?')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={styles.username}>{selected.userId?.username ?? '알 수 없음'}</Text>
          </View>
          <View style={styles.stats}>
            <View>
              <Text style={styles.statLabel}>거리</Text>
              <Text style={styles.statValue}>{selected.distanceKm.toFixed(2)} km</Text>
            </View>
            <View>
              <Text style={styles.statLabel}>페이스</Text>
              <Text style={styles.statValue}>{formatPace(selected.paceSecPerKm)}</Text>
            </View>
          </View>
          <Text style={styles.date}>{formatDate(selected.createdAt)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  myLocBtn: { position: 'absolute', bottom: 100, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  myLocTxt: { fontSize: 20 },
  card: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  closeBtn: { position: 'absolute', top: 12, right: 12, padding: 4 },
  closeTxt: { fontSize: 16, color: '#71717a' },
  thumb: { width: '100%', height: 130, borderRadius: 10, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e53935', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  username: { fontWeight: '600', fontSize: 14, color: '#18181b' },
  stats: { flexDirection: 'row', gap: 20, marginBottom: 6 },
  statLabel: { fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#18181b', marginTop: 2 },
  date: { fontSize: 11, color: '#a1a1aa' },
});
