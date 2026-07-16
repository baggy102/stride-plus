import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
// @ts-ignore — react-leaflet-cluster types not bundled
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useFocusEffect } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { RunMarker } from '../RunCard';
import { generateRouteImage } from '@/components/RunSummary/generateRouteImage';
import { AppLogo } from '@/components/AppLogo';

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
  html: `
    <div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center">
      <div class="run-dot-pulse" style="position:absolute;inset:0;border-radius:50%;background:rgba(179,229,252,0.25)"></div>
      <div style="width:11px;height:11px;border-radius:50%;background:#B3E5FC;border:2px solid #0A0A0A;box-shadow:0 0 8px rgba(179,229,252,0.7)"></div>
    </div>
  `,
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -13],
});

function createClusterIcon(cluster: { getChildCount: () => number }) {
  const n = cluster.getChildCount();
  const label = n >= 1000 ? `+${(n / 1000).toFixed(1)}K` : `+${n}`;
  return L.divIcon({
    html: `<div style="
      width:48px;height:48px;border-radius:50%;
      background:#0A0A0A;color:#B3E5FC;
      border:2px solid #B3E5FC;
      box-shadow:0 0 14px rgba(179,229,252,0.5),0 0 4px rgba(179,229,252,0.25);
      display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:900;letter-spacing:-0.5px;
      font-family:system-ui,sans-serif
    ">${label}</div>`,
    className: '',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
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
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);

  if (images.length === 0) return null;

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setIdx(i);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: 120, overflow: 'hidden', borderRadius: 8, marginBottom: 10 }}>
      <div
        ref={trackRef}
        onMouseDown={(e) => { drag.current = { x: e.pageX, left: trackRef.current?.scrollLeft ?? 0 }; }}
        onMouseMove={(e) => {
          if (!drag.current || !trackRef.current) return;
          e.preventDefault();
          trackRef.current.scrollLeft = drag.current.left + (drag.current.x - e.pageX);
        }}
        onMouseUp={() => {
          if (!drag.current || !trackRef.current) return;
          const el = trackRef.current;
          el.scrollTo({ left: Math.round(el.scrollLeft / el.clientWidth) * el.clientWidth, behavior: 'smooth' });
          drag.current = null;
        }}
        onMouseLeave={() => { drag.current = null; }}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth > 0) setIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
        style={{
          display: 'flex',
          overflowX: 'scroll',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          width: '100%',
          height: 140,
          cursor: 'grab',
          userSelect: 'none',
          scrollbarWidth: 'none' as const,
        }}
      >
        {images.map((img, i) => (
          <img
            key={i}
            src={`${baseUrl}${img}`}
            draggable={false}
            style={{ flexShrink: 0, width: '100%', height: 120, objectFit: 'cover', scrollSnapAlign: 'start', pointerEvents: 'none' }}
          />
        ))}
      </div>
      {images.length > 1 && (
        <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
          {images.map((_, i) => (
            <div
              key={i}
              onClick={() => goTo(i)}
              style={{ width: 6, height: 6, borderRadius: 3, cursor: 'pointer', background: i === idx ? '#B3E5FC' : 'rgba(255,255,255,0.4)' }}
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
  const insets = useSafeAreaInsets();
  const targetId = userId ?? user?._id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [flyTrigger, setFlyTrigger] = useState(0);

  // 지도 타일 다크화 CSS + 마커 펄스 애니메이션 주입
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'stride-map-styles';
    style.textContent = `
      .map-tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(1.6) contrast(0.8) saturate(0.5) !important; }
      .leaflet-popup-content-wrapper {
        background: #141414 !important;
        border: 1px solid #1F1F1F !important;
        border-radius: 12px !important;
        box-shadow: 0 4px 24px rgba(0,0,0,0.7) !important;
        color: #F5F5F5 !important;
      }
      .leaflet-popup-tip { background: #141414 !important; }
      .leaflet-popup-content { margin: 12px !important; }
      @keyframes runDotPulse {
        0%, 100% { transform: scale(1); opacity: 0.7; }
        50% { transform: scale(2.6); opacity: 0; }
      }
      .run-dot-pulse { animation: runDotPulse 2s ease-out infinite; }
    `;
    if (!document.getElementById('stride-map-styles')) {
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById('stride-map-styles');
      if (el) el.remove();
    };
  }, []);

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
              <ActivityIndicator size="small" color="#81D4FA" />
            ) : (
              <Text style={styles.stats}>{totalKm.toFixed(1)} km · {runs.length}회</Text>
            )}
          </View>
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
            className="map-tiles-dark"
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
                          <div style={{ fontSize: 10, color: '#404040', textTransform: 'uppercase', letterSpacing: 1 }}>거리</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#B3E5FC' }}>
                            {run.distanceKm.toFixed(2)} <span style={{ fontSize: 11, color: '#808080' }}>km</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#404040', textTransform: 'uppercase', letterSpacing: 1 }}>페이스</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#F5F5F5' }}>
                            {formatPace(run.paceSecPerKm)} <span style={{ fontSize: 11, color: '#808080' }}>/km</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#808080', marginTop: 6 }}>
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
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#0A0A0A', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#1F1F1F',
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12, alignSelf: 'stretch' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#B3E5FC', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarLetter: { color: '#01579B', fontSize: 22, fontWeight: 'bold' },
  headerInfo: { flex: 1 },
  username: { fontSize: 18, fontWeight: '700', color: '#F5F5F5' },
  stats: { fontSize: 13, color: '#808080', marginTop: 2 },
  mapWrapper: { flex: 1, position: 'relative' },
  myLocBtn: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    zIndex: 1000,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1F1F1F',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  myLocTxt: { fontSize: 20 },
});
