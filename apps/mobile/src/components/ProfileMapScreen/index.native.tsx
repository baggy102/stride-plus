import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { AppLogo } from '@/components/AppLogo';
import { MapPopupCard } from '@/components/MapPopupCard';
import { CARTO_TILE_URL, CARTO_ATTRIBUTION } from '@/config/mapTiles';
import { useColors, useScheme } from '@/theme/useColors';
import { withAlpha, type Palette } from '@/theme/colors';
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

function buildHtml(runs: RunWithRoute[], p: Palette, dark: boolean) {
  const m = p.map;
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
    #map { width:100vw; height:100vh; }
    .map-tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(1.6) contrast(0.8) saturate(0.5) !important; }
    .leaflet-popup-content-wrapper {
      background: ${p.surface} !important;
      border: 1px solid ${p.border} !important;
      border-radius: 12px !important;
      box-shadow: 0 4px 24px ${withAlpha(p.shadow, 0.7)} !important;
      color: ${p.text} !important;
    }
    .leaflet-popup-tip { background: ${p.surface} !important; }
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
  const runs = ${runsJson};
  const map = L.map('map', { zoomControl: true }).setView([37.5665, 126.978], 13);
  L.tileLayer('${CARTO_TILE_URL}', {
    attribution: '${CARTO_ATTRIBUTION}',
    className: '${dark ? 'map-tiles-dark' : ''}'
  }).addTo(map);

  const dotIcon = L.divIcon({
    html: '<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div class="run-dot-pulse" style="position:absolute;inset:0;border-radius:50%;background:${m.pulse}"></div><div style="width:11px;height:11px;border-radius:50%;background:${m.dot};border:2px solid ${m.dotBorder};box-shadow:0 0 8px ${withAlpha(m.dot, 0.7)}"></div></div>',
    className: '', iconSize: [22,22], iconAnchor: [11,11],
  });

  function clusterIcon(cluster) {
    const n = cluster.getChildCount();
    return L.divIcon({
      html: '<div style="width:48px;height:48px;border-radius:50%;background:${m.clBg};color:${m.clRing};border:2px solid ${m.clRing};box-shadow:0 0 14px ${m.clGlow},0 0 4px ${withAlpha(m.clRing, 0.25)};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:-0.5px;font-family:system-ui">+' + n + '</div>',
      className: '', iconSize: [48,48], iconAnchor: [24,24],
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
  const c = useColors();
  const dark = useScheme() === 'dark';
  const styles = useMemo(() => makeStyles(c), [c]);
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
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
      .catch(() => {}) // 실패 상태 화면은 U9에서 추가
      .finally(finish);

    client.get<RunWithRoute[]>(`/runs?userId=${targetId}&limit=50`)
      .then(({ data }) => setRuns(data))
      .catch(() => {})
      .finally(finish);
  }, [targetId]);

  // targetId가 hydration 후 처음 생길 때 fetch (SecureStore 비동기 타이밍 대응)
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 탭 재진입 시 리페치
  const skipFirstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
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
          <ActivityIndicator color={c.value} size="large" />
        </View>
      ) : (
        <>
          <WebView
            ref={webViewRef}
            source={{ html: buildHtml(runs, c, dark) }}
            style={StyleSheet.absoluteFillObject}
            originWhitelist={['*']}
            onMessage={(e) => {
              try { setSelected(JSON.parse(e.nativeEvent.data)); } catch {}
            }}
          />
          <Pressable style={styles.myLocBtn} onPress={handleMyLocation}>
            <Text style={styles.myLocTxt}>📍</Text>
          </Pressable>
        </>
      )}

      {/* 프로필 헤더 오버레이 */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <AppLogo />
        <View style={styles.userRow}>
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
              <ActivityIndicator size="small" color={c.text2} />
            ) : (
              <Text style={styles.stats}>{totalKm.toFixed(1)} km · {runs.length}회</Text>
            )}
          </View>
        </View>
      </View>

      {/* 선택된 런 카드 */}
      {selected && (
        <MapPopupCard
          run={selected}
          baseUrl={BASE_URL}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: c.header,
    alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12, alignSelf: 'stretch' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarLetter: { color: c.ink, fontSize: 22, fontWeight: 'bold' },
  headerInfo: { flex: 1 },
  username: { fontSize: 18, fontWeight: '700', color: c.text },
  stats: { fontSize: 13, color: c.text2, marginTop: 2 },
  myLocBtn: { position: 'absolute', bottom: 100, right: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, shadowColor: c.shadow, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  myLocTxt: { fontSize: 20 },
});
