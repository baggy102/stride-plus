import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
// @ts-ignore — react-leaflet-cluster types not bundled
import MarkerClusterGroup from 'react-leaflet-cluster';
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

const runDotIcon = L.divIcon({
  html: `<div style="width:13px;height:13px;border-radius:50%;background:#e53935;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
  className: '',
  iconSize: [13, 13],
  iconAnchor: [6, 6],
  popupAnchor: [0, -8],
});

function createClusterIcon(cluster: { getChildCount: () => number }) {
  const n = cluster.getChildCount();
  const label = n >= 1000 ? `+${(n / 1000).toFixed(1)}K` : `+${n}`;
  return L.divIcon({
    html: `<div style="
      width:44px;height:44px;border-radius:22px;
      background:rgba(229,57,53,0.88);color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:700;letter-spacing:-0.3px;
      border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.22);
    ">${label}</div>`,
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function formatPace(sec: number) {
  if (!sec) return `--'--"`;
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function FitBounds({ coords }: { coords: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length === 1) {
      map.setView(coords[0], 13);
    } else if (coords.length > 1) {
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

  const startPoints: LatLngTuple[] = runs
    .filter((r) => r.startPoint)
    .map((r) => [r.startPoint![1], r.startPoint![0]] as LatLngTuple);

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const displayName = profile?.username ?? user?.username ?? '';
  const avatarLetter = (displayName || '?')[0].toUpperCase();
  const center: LatLngTuple = startPoints.length > 0 ? startPoints[0] : [37.5665, 126.978];

  return (
    <View style={styles.container}>
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
          {startPoints.length > 0 && <FitBounds coords={startPoints} />}

          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={createClusterIcon}
            showCoverageOnHover={false}
            maxClusterRadius={60}
          >
            {runs.map((run) => {
              if (!run.startPoint) return null;
              const [lng, lat] = run.startPoint;
              return (
                <Marker key={run._id} position={[lat, lng]} icon={runDotIcon}>
                  <Popup closeButton={false} minWidth={200}>
                    <div style={{ padding: '4px 2px', fontFamily: 'system-ui, sans-serif' }}>
                      {run.thumbnailUrl && (
                        <img
                          src={run.thumbnailUrl}
                          alt="run"
                          style={{
                            width: '100%',
                            height: 120,
                            objectFit: 'cover',
                            borderRadius: 8,
                            marginBottom: 10,
                            display: 'block',
                          }}
                        />
                      )}
                      <div style={{ display: 'flex', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 }}>거리</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#18181b' }}>
                            {run.distanceKm.toFixed(2)} <span style={{ fontSize: 11, color: '#71717a' }}>km</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 }}>페이스</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#18181b' }}>
                            {formatPace(run.paceSecPerKm)} <span style={{ fontSize: 11, color: '#71717a' }}>/km</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 6 }}>
                        {formatDate(run.createdAt as unknown as string)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </View>
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
});
