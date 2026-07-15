import { Suspense, lazy, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';

// Leaflet은 window에 의존하므로 CSR에서만 lazy import
const MapContent = lazy(() => import('./MapContent.web'));

export function MapFeed() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#B3E5FC" />
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#B3E5FC" />
        </View>
      }
    >
      <MapContent />
    </Suspense>
  );
}
