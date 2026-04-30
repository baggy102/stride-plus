import '../global.css';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/auth';
import { registerUnauthenticatedHandler } from '@/api/client';

export default function RootLayout() {
  const { isAuthenticated, isHydrating, hydrate, logout } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // 앱 시작: 리프레시 실패 핸들러 등록 후 토큰 유효성 확인
  useEffect(() => {
    registerUnauthenticatedHandler(logout);
    hydrate();
  }, []);

  // isAuthenticated 변경 시 라우트 분기
  useEffect(() => {
    if (isHydrating) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/feed');
    }
  }, [isAuthenticated, isHydrating, segments]);

  if (isHydrating) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Slot />
    </>
  );
}
