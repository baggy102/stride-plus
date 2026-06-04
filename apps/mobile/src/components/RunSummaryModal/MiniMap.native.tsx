import { View } from 'react-native';
import MapView, { Polyline, Region } from 'react-native-maps';

interface Props {
  coordinates: [number, number][]; // [lng, lat]
}

function toRegion(coords: [number, number][]): Region {
  if (coords.length === 0) {
    return { latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.01, longitudeDelta: 0.01 };
  }
  const lats = coords.map((c) => c[1]);
  const lngs = coords.map((c) => c[0]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 0.002;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(maxLat - minLat + pad, 0.005),
    longitudeDelta: Math.max(maxLng - minLng + pad, 0.005),
  };
}

export function MiniMap({ coordinates }: Props) {
  const latLngs = coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

  return (
    <View className="w-full h-44 rounded-2xl overflow-hidden">
      <MapView
        style={{ flex: 1 }}
        region={toRegion(coordinates)}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {latLngs.length > 1 && (
          <Polyline coordinates={latLngs} strokeColor="#3b82f6" strokeWidth={3} />
        )}
      </MapView>
    </View>
  );
}
