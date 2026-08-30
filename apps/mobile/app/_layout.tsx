import '../styles';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/auth';
import { registerUnauthenticatedHandler } from '@/api/client';

export default function RootLayout() {
  const { isAuthenticated, isHydrating, hydrate, logout } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  // 앱 시작: 리프레시 실패 핸들러 등록 후 토큰 유효성 확인
  useEffect(() => {
    registerUnauthenticatedHandler(logout);
    hydrate();
  }, []);

  // isAuthenticated 변경 시 라우트 분기 — navigationState.key 로 준비 여부 확인
  useEffect(() => {
    if (!navigationState?.key) return;
    if (isHydrating) return;
    const inAuthGroup = segments[0] === '(auth)';
    const atRoot = segments.length === 0;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && (inAuthGroup || atRoot)) {
      router.replace('/(tabs)/feed');
    }
  }, [navigationState?.key, isAuthenticated, isHydrating, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Slot />
      {isHydrating && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#B3E5FC" />
        </View>
      )}
    </GestureHandlerRootView>
  );
}
