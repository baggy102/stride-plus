import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import MapView, { Circle, Marker, Region } from 'react-native-maps';
import ClusteredMapView from 'react-native-maps-clustering';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { RunMarker } from '../RunCard';

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function formatPace(sec: number) {
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function latDeltaToRadius(delta: number) {
  return Math.round(delta * 111000);
}

export function MapFeed() {
  const [region, setRegion] = useState<Region>(SEOUL);
  const [myLoc, setMyLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [runs, setRuns] = useState<RunMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RunMarker | null>(null);
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const skipFirstFocus = useRef(true);

  const fetchRuns = useCallback(async (r: Region) => {
    try {
      const radius = latDeltaToRadius(r.latitudeDelta);
      const { data } = await client.get<RunMarker[]>(
        `/runs?lat=${r.latitude}&lng=${r.longitude}&radius=${radius}`,
      );
      setRuns(data);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let initialRegion = SEOUL;
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = pos.coords;
        setMyLoc({ latitude, longitude });
        initialRegion = { ...SEOUL, latitude, longitude };
      }
      setRegion(initialRegion);
      fetchRuns(initialRegion);
      setLoading(false);
    })();
  }, [fetchRuns]);

  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    fetchRuns(region);
  }, [fetchRuns, region]));

  const handleMarkerPress = useCallback((run: RunMarker) => {
    setSelected(run);
    bottomSheetRef.current?.expand();
  }, []);

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      setMyLoc({ latitude, longitude });
      const next = { ...region, latitude, longitude };
      mapRef.current?.animateToRegion(next, 400);
      fetchRuns(next);
    } catch {}
  }, [region, fetchRuns]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e53935" size="large" />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <ClusteredMapView
        ref={mapRef as React.RefObject<ClusteredMapView>}
        style={StyleSheet.absoluteFillObject}
        region={region}
        onRegionChangeComplete={(r) => { setRegion(r); fetchRuns(r); }}
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
        {myLoc && (
          <Circle
            center={myLoc}
            radius={60}
            fillColor="rgba(59,130,246,0.8)"
            strokeColor="#3b82f6"
            strokeWidth={2}
          />
        )}
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
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarTxt}>
                    {(selected.userId?.username || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.username}>{selected.userId?.username || '알 수 없음'}</Text>
              </View>
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
              <Text style={styles.date}>{formatDate(selected.createdAt)}</Text>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#e53935', alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  username: { color: '#fff', fontWeight: '600', fontSize: 15 },
  statsRow: { flexDirection: 'row', gap: 24, marginBottom: 8 },
  statLabel: { fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 2 },
  date: { fontSize: 12, color: '#71717a' },
});
