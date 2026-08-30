import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { AppLogo } from '@/components/AppLogo';
// @ts-ignore — react-leaflet-cluster types not bundled
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useFocusEffect, useRouter } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };
const RADIUS = 15000;

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

function formatPace(sec: number) {
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function MapMoveHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useMapEvents({
    moveend: (e) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const c = e.target.getCenter();
        onMove(c.lat, c.lng);
      }, 500);
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [loc, setLoc] = useState(SEOUL);
  const [runs, setRuns] = useState<RunMarker[]>([]);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const skipFirstFocus = useRef(true);

  // 지도 다크화 CSS + 마커 펄스 애니메이션 주입
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'stride-mapfeed-styles';
    style.textContent = `
      .map-tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(1.6) contrast(0.8) saturate(0.5) !important; }
      .leaflet-top.leaflet-left { top: 68px !important; }
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
    if (!document.getElementById('stride-mapfeed-styles')) {
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById('stride-mapfeed-styles');
      if (el) el.remove();
    };
  }, []);

  const fetchRuns = useCallback(async (lat: number, lng: number) => {
    try {
      const { data } = await client.get<RunMarker[]>(
        `/runs?lat=${lat}&lng=${lng}&radius=${RADIUS}`,
      );
      setRuns(data);
    } catch {}
  }, []);

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

  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    fetchRuns(loc.lat, loc.lng);
  }, [fetchRuns, loc]));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#B3E5FC" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 지도 — 전체 채우기 */}
      <MapContainer
        center={[loc.lat, loc.lng]}
        zoom={11}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        zoomControl
        attributionControl
      >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            className="map-tiles-dark"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>'
          />
          <MapMoveHandler onMove={fetchRuns} />
          <FlyToMe trigger={flyTrigger} />

          {/* 내 위치 마커 — 흰색 채우기 + Frost Blue 테두리 (러닝 기록 마커와 구분) */}
          <CircleMarker
            center={[loc.lat, loc.lng]}
            radius={9}
            pathOptions={{ color: '#B3E5FC', fillColor: '#FFFFFF', fillOpacity: 1, weight: 3 }}
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
                    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
                      <PopupCarousel
                        images={[run.routeImageUrl, ...run.photoUrls].filter(Boolean) as string[]}
                        baseUrl={BASE_URL}
                      />
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: run.userId?._id ? 'pointer' : 'default' }}
                        onClick={() => { if (run.userId?._id) router.push(`/user/${run.userId._id}`); }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: '#B3E5FC', color: '#01579B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {(run.userId?.username ?? '?')[0].toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#F5F5F5' }}>
                          {run.userId?.username || '알 수 없음'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
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
                      <div style={{ fontSize: 11, color: '#808080' }}>
                        {formatDate(run.createdAt as unknown as string)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
      </MapContainer>

      {/* 헤더 오버레이 — 지도 위에 absolute 배치 */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <AppLogo />
      </View>

      <Pressable style={styles.myLocBtn} onPress={() => setFlyTrigger((t) => t + 1)}>
        <Text style={styles.myLocTxt}>📍</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', position: 'relative' },
  center: { flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000,
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderBottomWidth: 1, borderBottomColor: '#1F1F1F',
    alignItems: 'center',
  },
  myLocBtn: {
    position: 'absolute', bottom: 24, right: 16, zIndex: 1000,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1F1F1F',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  myLocTxt: { fontSize: 20 },
});
