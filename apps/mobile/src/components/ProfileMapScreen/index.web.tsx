import { Suspense, lazy, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import type { ProfileMapScreenProps } from '.';

const ProfileContent = lazy(() => import('./ProfileContent.web'));

export function ProfileMapScreen({ userId }: ProfileMapScreenProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#e53935" />
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#e53935" />
        </View>
      }
    >
      <ProfileContent userId={userId} />
    </Suspense>
  );
}
