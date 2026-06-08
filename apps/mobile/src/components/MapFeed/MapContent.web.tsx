import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Pressable } from 'react-native';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
// @ts-ignore — react-leaflet-cluster types not bundled
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useFocusEffect } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };
const RADIUS = 15000;

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

function PopupCarousel({ images, baseUrl }: { images: string[]; baseUrl: string }) {
  const [idx, setIdx] = useState(0);
  if (images.length === 0) return null;

  const wrap = {
    position: 'relative' as const, width: '100%', height: 120,
    overflow: 'hidden', borderRadius: 8, marginBottom: 10,
  };
  const dot = (i: number) => ({
    width: 6, height: 6, borderRadius: 3, cursor: 'pointer' as const,
    background: i === idx ? '#fff' : 'rgba(255,255,255,0.5)',
  });

  return (
    <div style={wrap}>
      <img
        src={`${baseUrl}${images[idx]}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {images.length > 1 && (
        <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 }}>
          {images.map((_, i) => (
            <div key={i} style={dot(i)} onClick={() => setIdx(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatPace(sec: number) {
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function MapMoveHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter();
      onMove(c.lat, c.lng);
    },
  });
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

export default function MapContent() {
  const [loading, setLoading] = useState(true);
  const [loc, setLoc] = useState(SEOUL);
  const [runs, setRuns] = useState<RunMarker[]>([]);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const skipFirstFocus = useRef(true);

  const fetchRuns = useCallback(async (lat: number, lng: number) => {
    try {
      const { data } = await client.get<RunMarker[]>(
        `/runs?lat=${lat}&lng=${lng}&radius=${RADIUS}`,
      );
      setRuns(data);
    } catch {}
  }, []);

  // 최초 마운트: 내 위치 확보 후 fetch
  useEffect(() => {
    new Promise<GeolocationPosition>((res, rej) =>
      navigator.geolocation?.getCurrentPosition(res, rej, { timeout: 5000 }),
    )
      .then((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLoc({ lat, lng });
        fetchRuns(lat, lng);
      })
      .catch(() => fetchRuns(SEOUL.lat, SEOUL.lng))
      .finally(() => setLoading(false));
  }, [fetchRuns]);

  // 탭 재진입 시 리페치
  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    fetchRuns(loc.lat, loc.lng);
  }, [fetchRuns, loc]));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>주변 러닝</Text>
      </View>
      <View style={styles.mapWrapper}>
        <MapContainer
          center={[loc.lat, loc.lng]}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl
          attributionControl
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>'
          />
          <MapMoveHandler onMove={fetchRuns} />
          <FlyToMe trigger={flyTrigger} />

          <CircleMarker
            center={[loc.lat, loc.lng]}
            radius={9}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }}
          />

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
                  <Popup closeButton={false} minWidth={220}>
                    <div style={{ padding: '4px 2px', fontFamily: 'system-ui, sans-serif' }}>
                      <PopupCarousel
                        images={[run.routeImageUrl, ...run.photoUrls].filter(Boolean) as string[]}
                        baseUrl={BASE_URL}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: '#e53935', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {(run.userId?.username ?? '?')[0].toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#18181b' }}>
                          {run.userId?.username || '알 수 없음'}
                        </span>
                      </div>
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
  center: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12 },
  title: { color: '#09090b', fontSize: 20, fontWeight: 'bold' },
  mapWrapper: { flex: 1 },
  myLocBtn: {
    position: 'absolute',
    bottom: 24,
    right: 16,
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
