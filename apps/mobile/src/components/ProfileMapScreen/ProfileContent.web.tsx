import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, Pressable } from 'react-native';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
// @ts-ignore — react-leaflet-cluster types not bundled
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useFocusEffect } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { RunMarker } from '../RunCard';
import { generateRouteImage } from '@/components/RunSummaryModal/generateRouteImage';

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
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function PopupCarousel({ images, baseUrl }: { images: string[]; baseUrl: string }) {
  const [idx, setIdx] = useState(0);
  if (images.length === 0) return null;

  return (
    <div style={{ position: 'relative', width: '100%', height: 120, overflow: 'hidden', borderRadius: 8, marginBottom: 10 }}>
      <img
        src={`${baseUrl}${images[idx]}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {images.length > 1 && (
        <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
          {images.map((_, i) => (
            <div
              key={i}
              onClick={() => setIdx(i)}
              style={{ width: 6, height: 6, borderRadius: 3, cursor: 'pointer', background: i === idx ? '#fff' : 'rgba(255,255,255,0.5)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FitBounds({ coords }: { coords: LatLngTuple[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || coords.length === 0) return;
    fitted.current = true;
    if (coords.length === 1) map.setView(coords[0], 13);
    else map.fitBounds(coords, { padding: [40, 40] });
  }, [map, coords]);
  return null;
}

function FlyToMe({ trigger }: { trigger: number }) {
  const map = useMap();
  const last = useRef(0);
  useEffect(() => {
    if (trigger === last.current) return;
    last.current = trigger;
    navigator.geolocation?.getCurrentPosition(
      (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], 14),
      undefined,
      { enableHighAccuracy: false },
    );
  }, [trigger, map]);
  return null;
}

export default function ProfileContent({ userId }: Props) {
  const { user } = useAuthStore();
  const targetId = userId ?? user?._id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [flyTrigger, setFlyTrigger] = useState(0);

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

  const skipFirstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    fetchData();
  }, [fetchData]));

  // 기존 런 중 routeImageUrl 없는 것 자동 생성·업로드
  const migrationDone = useRef(false);
  useEffect(() => {
    if (migrationDone.current || runs.length === 0) return;
    const toMigrate = runs.filter((r) => !r.routeImageUrl && r.route?.length > 1);
    if (toMigrate.length === 0) { migrationDone.current = true; return; }
    migrationDone.current = true;

    toMigrate.forEach(async (run) => {
      try {
        const img = await generateRouteImage(run.route);
        if (!img) return;
        const form = new FormData();
        form.append('routeImage', img as unknown as Blob);
        const { data } = await client.patch<{ routeImageUrl: string }>(
          `/runs/${run._id}/route-image`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        setRuns((prev) => prev.map((r) => r._id === run._id ? { ...r, routeImageUrl: data.routeImageUrl } : r));
      } catch {}
    });
  }, [runs]);

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
            <Text style={styles.stats}>{totalKm.toFixed(1)} km · {runs.length}회</Text>
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
          <FlyToMe trigger={flyTrigger} />

          <MarkerClusterGroup
            chunkedLoading
            iconCreateFunction={createClusterIcon}
            showCoverageOnHover={false}
            maxClusterRadius={60}
          >
            {runs.map((run) => {
              if (!run.startPoint) return null;
              const [lng, lat] = run.startPoint;
              const images = [run.routeImageUrl, ...run.photoUrls].filter(Boolean) as string[];
              return (
                <Marker key={run._id} position={[lat, lng]} icon={runDotIcon}>
                  <Popup closeButton={false} minWidth={200}>
                    <div style={{ padding: '4px 2px', fontFamily: 'system-ui, sans-serif' }}>
                      <PopupCarousel images={images} baseUrl={BASE_URL} />
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

        {/* 내 위치 버튼 */}
        <Pressable style={styles.myLocBtn} onPress={() => setFlyTrigger((t) => t + 1)}>
          <Text style={styles.myLocTxt}>📍</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
    backgroundColor: '#fff', gap: 14,
    borderBottomWidth: 1, borderBottomColor: '#e4e4e7',
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e53935', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  headerInfo: { flex: 1 },
  username: { fontSize: 18, fontWeight: '700', color: '#18181b' },
  stats: { fontSize: 13, color: '#71717a', marginTop: 2 },
  mapWrapper: { flex: 1, position: 'relative' },
  myLocBtn: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    zIndex: 1000,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  myLocTxt: { fontSize: 20 },
});
