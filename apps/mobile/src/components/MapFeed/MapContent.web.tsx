import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet';
import client from '@/api/client';
import { RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };
const RADIUS = 15000; // 15km

function MapMoveHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter();
      onMove(c.lat, c.lng);
    },
  });
  return null;
}

export default function MapContent() {
  const [loading, setLoading] = useState(true);
  const [loc, setLoc] = useState(SEOUL);
  const [runs, setRuns] = useState<RunMarker[]>([]);

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
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl
          attributionControl
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>'
          />
          <MapMoveHandler onMove={fetchRuns} />

          {/* 내 위치 */}
          <CircleMarker
            center={[loc.lat, loc.lng]}
            radius={10}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }}
          />

          {/* 주변 런 시작점 마커 */}
          {runs.map((run) =>
            run.startPoint ? (
              <CircleMarker
                key={run._id}
                center={[run.startPoint[1], run.startPoint[0]]}
                radius={8}
                pathOptions={{
                  color: '#e53935',
                  fillColor: '#e53935',
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              />
            ) : null,
          )}
        </MapContainer>
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
});
