import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import ClusteredMapView from 'react-native-maps-clustering';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

const INITIAL_REGION: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

function formatPace(sec: number) {
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

export function ProfileMapScreen({ userId }: Props) {
  const { user } = useAuthStore();
  const targetId = userId ?? user?._id;
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RunWithRoute | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const skipFirstFocus = useRef(true);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    fetchData();
  }, [fetchData]));

  // 모든 런 좌표가 로드되면 지도 범위 맞춤
  useEffect(() => {
    if (!mapReady || runs.length === 0) return;
    const coords = runs
      .filter((r) => r.startPoint)
      .map((r) => ({ latitude: r.startPoint![1], longitude: r.startPoint![0] }));
    if (coords.length === 0) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: insets.top + 160, right: 40, bottom: 80, left: 40 },
      animated: true,
    });
  }, [mapReady, runs, insets.top]);

  const handleMarkerPress = useCallback((run: RunWithRoute) => {
    setSelected(run);
    bottomSheetRef.current?.expand();
  }, []);

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    } catch {}
  }, []);

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const displayName = profile?.username ?? user?.username ?? '';
  const avatarLetter = (displayName || '?')[0].toUpperCase();

  return (
    <View style={styles.container}>
      <ClusteredMapView
        ref={mapRef as React.RefObject<ClusteredMapView>}
        style={StyleSheet.absoluteFillObject}
        initialRegion={INITIAL_REGION}
        onMapReady={() => setMapReady(true)}
        clusterColor="#E53935"
        clusterTextColor="#fff"
        radius={40}
        renderCluster={(cluster: {
          geometry: { coordinates: number[] };
          onPress: () => void;
          properties: { cluster_id: number; point_count: number };
        }) => {
          const { geometry, onPress, properties } = cluster;
          const [lng, lat] = geometry.coordinates;
          return (
            <Marker
              key={`cluster-${properties.cluster_id}`}
              coordinate={{ latitude: lat, longitude: lng }}
              onPress={onPress}
            >
              <View style={styles.cluster}>
                <Text style={styles.clusterText}>+{properties.point_count}</Text>
              </View>
            </Marker>
          );
        }}
      >
        {runs.map((run) => {
          if (!run.startPoint) return null;
          const [lng, lat] = run.startPoint;
          return (
            <Marker
              key={run._id}
              coordinate={{ latitude: lat, longitude: lng }}
              onPress={() => handleMarkerPress(run)}
            >
              <View style={styles.dot} />
            </Marker>
          );
        })}
      </ClusteredMapView>

      {/* 프로필 헤더 오버레이 */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
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

      {/* 내 위치 버튼 */}
      <Pressable style={styles.myLocBtn} onPress={handleMyLocation}>
        <Text style={styles.myLocTxt}>📍</Text>
      </Pressable>

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['50%']}
        enablePanDownToClose
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        onClose={() => setSelected(null)}
      >
        <BottomSheetView style={styles.card}>
          {selected && (
            <>
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
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#E53935', borderWidth: 2, borderColor: '#fff',
  },
  cluster: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(229,57,53,0.88)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  clusterText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,255,255,0.93)',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16, gap: 14,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#e53935', alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  headerInfo: { flex: 1 },
  username: { fontSize: 18, fontWeight: '700', color: '#18181b' },
  stats: { fontSize: 13, color: '#71717a', marginTop: 2 },
  myLocBtn: {
    position: 'absolute', bottom: 120, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  myLocTxt: { fontSize: 20 },
  sheet: { backgroundColor: '#18181b' },
  handle: { backgroundColor: '#52525b' },
  card: { paddingHorizontal: 20, paddingTop: 8 },
  thumb: { width: '100%', height: 140, borderRadius: 12, marginBottom: 14 },
  statsRow: { flexDirection: 'row', gap: 24, marginBottom: 8 },
  statLabel: { fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 2 },
  date: { fontSize: 12, color: '#71717a' },
});
