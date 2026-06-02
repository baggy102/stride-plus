import { useCallback, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { RunMarker } from '../RunCard';

interface UserProfile {
  _id: string;
  username: string;
  profileImageUrl?: string;
}

interface RunWithRoute extends RunMarker {
  route: [number, number][];
}

interface Props {
  userId?: string;
}

function formatPace(sec: number) {
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

function buildHtml(runs: RunWithRoute[], baseUrl: string) {
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
  const runs = ${runsJson};
  const map = L.map('map', { zoomControl: true }).setView([37.5665, 126.978], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OSM © CARTO'
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
  const allLatLng = [];

  runs.forEach(function(run) {
    if (!run.startPoint) return;
    const lat = run.startPoint[1], lng = run.startPoint[0];
    allLatLng.push([lat, lng]);
    const m = L.marker([lat, lng], { icon: dotIcon });
    m.on('click', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify(run));
    });
    group.addLayer(m);
  });

  map.addLayer(group);

  if (allLatLng.length > 1) {
    map.fitBounds(allLatLng, { padding: [40, 40] });
  } else if (allLatLng.length === 1) {
    map.setView(allLatLng[0], 14);
  }
</script>
</body>
</html>`;
}

export function ProfileMapScreen({ userId }: Props) {
  const { user } = useAuthStore();
  const targetId = userId ?? user?._id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RunWithRoute | null>(null);
  const webViewRef = useRef<WebView>(null);

  const fetchData = useCallback(() => {
    if (!targetId) return;
    setLoading(true);
    let done = 0;
    const finish = () => { if (++done === 2) setLoading(false); };

    client.get<UserProfile>(`/users/${targetId}`)
      .then(({ data }) => setProfile(data))
      .catch((e) => console.error('[profile] users fetch failed', e))
      .finally(finish);

    client.get<RunWithRoute[]>(`/runs?userId=${targetId}&limit=50`)
      .then(({ data }) => setRuns(data))
      .catch((e) => console.error('[profile] runs fetch failed', e))
      .finally(finish);
  }, [targetId]);

  // 탭 포커스마다 리페치 (최초 포함)
  useFocusEffect(useCallback(() => {
    fetchData();
  }, [fetchData]));

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webViewRef.current?.injectJavaScript(`map.flyTo([${latitude}, ${longitude}], 14); true;`);
    } catch {}
  }, []);

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const displayName = profile?.username ?? user?.username ?? '';
  const avatarLetter = (displayName || '?')[0].toUpperCase();

  return (
    <View style={styles.container}>
      {/* 지도 */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e53935" size="large" />
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html: buildHtml(runs, BASE_URL) }}
          style={StyleSheet.absoluteFillObject}
          originWhitelist={['*']}
          onMessage={(e) => {
            try { setSelected(JSON.parse(e.nativeEvent.data)); } catch {}
          }}
        />
        <Pressable style={styles.myLocBtn} onPress={handleMyLocation}>
          <Text style={styles.myLocTxt}>📍</Text>
        </Pressable>
      )}

      {/* 프로필 헤더 오버레이 */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          {profile?.profileImageUrl ? (
            <Image source={{ uri: profile.profileImageUrl }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarLetter}>{avatarLetter}</Text>
          )}
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.username}>{displayName}</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#71717a" />
          ) : (
            <Text style={styles.stats}>{totalKm.toFixed(1)} km · {runs.length}회</Text>
          )}
        </View>
      </View>

      {/* 선택된 런 카드 */}
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
          <View style={styles.statsRow}>
            <View>
              <Text style={styles.statLabel}>거리</Text>
              <Text style={styles.statValue}>{selected.distanceKm.toFixed(2)} km</Text>
            </View>
            <View>
              <Text style={styles.statLabel}>페이스</Text>
              <Text style={styles.statValue}>{formatPace(selected.paceSecPerKm)}</Text>
            </View>
          </View>
          <Text style={styles.date}>
            {new Date(selected.createdAt).toLocaleDateString('ko-KR')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,255,255,0.93)',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, gap: 14,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e53935', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  headerInfo: { flex: 1 },
  username: { fontSize: 18, fontWeight: '700', color: '#18181b' },
  stats: { fontSize: 13, color: '#71717a', marginTop: 2 },
  card: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
  closeBtn: { position: 'absolute', top: 12, right: 12, padding: 4 },
  closeTxt: { fontSize: 16, color: '#71717a' },
  thumb: { width: '100%', height: 130, borderRadius: 10, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 6 },
  statLabel: { fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#18181b', marginTop: 2 },
  date: { fontSize: 11, color: '#a1a1aa' },
  myLocBtn: { position: 'absolute', bottom: 100, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  myLocTxt: { fontSize: 20 },
});
