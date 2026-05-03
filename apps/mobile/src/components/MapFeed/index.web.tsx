import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';

const SEOUL = { lat: 37.5665, lng: 126.978 };

function buildMapHtml(lat: number, lng: number) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #09090b; }
    .leaflet-control-attribution { font-size: 9px !important; opacity: 0.5; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OSM'
    }).addTo(map);
    L.circleMarker([${lat}, ${lng}], {
      radius: 10, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1, weight: 3
    }).addTo(map);
  </script>
</body>
</html>`;
}

export function MapFeed() {
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
      {/* @ts-ignore */}
      <iframe
        srcDoc={buildMapHtml(loc.lat, loc.lng)}
        style={{ flex: 1, border: 'none', display: 'block' }}
        title="map"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  center: { flex: 1, backgroundColor: '#09090b', alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
