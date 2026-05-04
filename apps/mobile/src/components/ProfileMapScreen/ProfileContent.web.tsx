import 'leaflet/dist/leaflet.css';
import { Fragment, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import client from '@/api/client';
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

function FitBounds({ coords }: { coords: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 1) {
      map.fitBounds(coords, { padding: [40, 40] });
    }
  }, [map, coords]);
  return null;
}

export default function ProfileContent({ userId }: Props) {
  const { user } = useAuthStore();
  const targetId = userId ?? user?._id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RunWithRoute | null>(null);

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

  const allCoords: LatLngTuple[] = runs.flatMap((r) =>
    r.route.map(([lng, lat]) => [lat, lng] as LatLngTuple),
  );

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const displayName = profile?.username ?? user?.username ?? '';
  const avatarLetter = (displayName || '?')[0].toUpperCase();

  const center: LatLngTuple =
    allCoords.length > 0 ? allCoords[0] : [37.5665, 126.978];

  return (
    <View style={styles.container}>
      {/* 프로필 헤더 */}
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
            <Text style={styles.stats}>
              {totalKm.toFixed(1)} km · {runs.length}회
            </Text>
          )}
        </View>
      </View>

      {/* 지도 */}
      <View style={styles.mapWrapper}>
        <MapContainer
          center={center}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl
          attributionControl
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>'
          />
          {allCoords.length > 1 && <FitBounds coords={allCoords} />}
          {runs.map((run) => {
            const routeCoords: LatLngTuple[] = run.route.map(
              ([lng, lat]) => [lat, lng] as LatLngTuple,
            );
            return (
              <Fragment key={run._id}>
                {routeCoords.length > 1 && (
                  <Polyline
                    positions={routeCoords}
                    pathOptions={{ color: 'rgba(229,57,53,0.6)', weight: 3 }}
                  />
                )}
                {run.startPoint && (
                  <CircleMarker
                    center={[run.startPoint[1], run.startPoint[0]]}
                    radius={7}
                    pathOptions={{
                      color: '#e53935',
                      fillColor: '#e53935',
                      fillOpacity: 1,
                      weight: 2,
                    }}
                    eventHandlers={{ click: () => setSelected(run) }}
                  />
                )}
              </Fragment>
            );
          })}
        </MapContainer>
      </View>

      {/* 선택된 런 카드 */}
      {selected && (
        <View style={styles.selectedCard}>
          <View style={styles.selectedRow}>
            <Text style={styles.selectedDist}>
              {selected.distanceKm.toFixed(2)} km
            </Text>
            <Text
              style={styles.closeBtn}
              onPress={() => setSelected(null)}
            >
              ✕
            </Text>
          </View>
          <Text style={styles.selectedDate}>
            {new Date(selected.createdAt).toLocaleDateString('ko-KR')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    backgroundColor: '#fff',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
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
  mapWrapper: { flex: 1 },
  selectedCard: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  selectedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectedDist: { fontSize: 20, fontWeight: '700', color: '#18181b' },
  closeBtn: { fontSize: 18, color: '#71717a', padding: 4 },
  selectedDate: { fontSize: 13, color: '#71717a', marginTop: 4 },
});
