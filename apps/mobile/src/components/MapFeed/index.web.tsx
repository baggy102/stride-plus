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
      <View style={{ flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      }
    >
      <MapContent />
    </Suspense>
  );
}
