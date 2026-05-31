import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import client from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { RunCard, RunMarker } from '../RunCard';

interface UserProfile {
  _id: string;
  username: string;
  profileImageUrl?: string;
}

interface RunWithRoute extends RunMarker {
  route: [number, number][];
}

const INITIAL_REGION = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

interface Props {
  userId?: string;
}

export function ProfileMapScreen({ userId }: Props) {
  const { user } = useAuthStore();
  const targetId = userId ?? user?._id;

  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [selected, setSelected] = useState<RunWithRoute | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!targetId) return;
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

  const fitToRuns = useCallback(
    (rs: RunWithRoute[]) => {
      if (rs.length === 0) return;
      const coords = rs.flatMap((r) =>
        r.route.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      );
      if (coords.length === 0) return;
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: insets.top + 160, right: 40, bottom: 80, left: 40 },
        animated: true,
      });
    },
    [insets.top],
  );

  useEffect(() => {
    if (mapReady && runs.length > 0) fitToRuns(runs);
  }, [mapReady, runs, fitToRuns]);

  const handleMarkerPress = useCallback((run: RunWithRoute) => {
    setSelected(run);
    bottomSheetRef.current?.expand();
  }, []);

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const displayName = profile?.username ?? user?.username ?? '';
  const avatarLetter = (displayName || '?')[0].toUpperCase();

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={INITIAL_REGION}
        onMapReady={() => setMapReady(true)}
      >
        {runs.map((run) => (
          <Fragment key={run._id}>
            {run.route.length > 1 && (
              <Polyline
                coordinates={run.route.map(([lng, lat]) => ({
                  latitude: lat,
                  longitude: lng,
                }))}
                strokeColor="rgba(229, 57, 53, 0.6)"
                strokeWidth={3}
              />
            )}
            {run.startPoint && (
              <Marker
                coordinate={{
                  latitude: run.startPoint[1],
                  longitude: run.startPoint[0],
                }}
                onPress={() => handleMarkerPress(run)}
              >
                <View style={styles.dot} />
              </Marker>
            )}
          </Fragment>
        ))}
      </MapView>

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
            <Text style={styles.stats}>
              {totalKm.toFixed(1)} km · {runs.length}회
            </Text>
          )}
        </View>
      </View>

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={['45%']}
        enablePanDownToClose
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        onClose={() => setSelected(null)}
      >
        <BottomSheetView>
          {selected && <RunCard run={selected} />}
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.93)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  headerInfo: { flex: 1 },
  username: { fontSize: 18, fontWeight: '700', color: '#18181b' },
  stats: { fontSize: 13, color: '#71717a', marginTop: 2 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#e53935',
    borderWidth: 2,
    borderColor: '#fff',
  },
  sheet: { backgroundColor: '#18181b' },
  handle: { backgroundColor: '#52525b' },
});
