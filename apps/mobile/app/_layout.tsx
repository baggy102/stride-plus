import '../styles';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
    const atRoot = segments.length === 0;

    if (!isAuthenticated && !inAuthGroup) {
      // 미인증: 보호된 경로 → 로그인
      router.replace('/(auth)/login');
    } else if (isAuthenticated && (inAuthGroup || atRoot)) {
      // 인증됨: auth 그룹이거나 루트(/)에 있으면 → 피드
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Slot />
    </GestureHandlerRootView>
  );
}
