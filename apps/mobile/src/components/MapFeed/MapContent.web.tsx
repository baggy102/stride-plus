import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import client from '@/api/client';
import { RunCard, RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };

export default function MapContent() {
  const [loading, setLoading] = useState(true);
  const [loc, setLoc] = useState(SEOUL);

  useEffect(() => {
    new Promise<GeolocationPosition>((res, rej) =>
      navigator.geolocation?.getCurrentPosition(res, rej, { timeout: 5000 }),
    )
      .then((pos) => setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl
          attributionControl
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>'
          />
          <CircleMarker
            center={[loc.lat, loc.lng]}
            radius={10}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1, weight: 3 }}
          />
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
