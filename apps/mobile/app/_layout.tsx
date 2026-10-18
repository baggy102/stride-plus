import '../styles';
import { useEffect, useMemo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { vars } from 'nativewind';
import { useFonts } from 'expo-font';
import { FONT_ASSETS } from '@/theme/fonts';
import { useAuthStore } from '@/store/auth';
import { useThemeStore } from '@/store/theme';
import { registerUnauthenticatedHandler } from '@/api/client';
import { useColors, useScheme } from '@/theme/useColors';
import { toRgbChannels } from '@/theme/colors';

export default function RootLayout() {
  const { isAuthenticated, isHydrating, hydrate, logout } = useAuthStore();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const scheme = useScheme();
  const c = useColors();
  const [fontsLoaded] = useFonts(FONT_ASSETS);

  // tailwind brand-* 클래스가 읽는 CSS 변수
  const themeVars = useMemo(() => vars({
    '--color-bg': toRgbChannels(c.bg),
    '--color-surface': toRgbChannels(c.surface),
    '--color-border': toRgbChannels(c.border),
    '--color-muted': toRgbChannels(c.muted),
    '--color-text': toRgbChannels(c.text),
    '--color-text2': toRgbChannels(c.text2),
    '--color-value': toRgbChannels(c.value),
  }), [c]);

  // 앱 시작: 리프레시 실패 핸들러 등록 후 토큰 유효성 확인
  useEffect(() => {
    registerUnauthenticatedHandler(logout);
    hydrate();
    hydrateTheme();
  }, []);

  // isAuthenticated 변경 시 라우트 분기 — navigationState.key 로 준비 여부 확인
  useEffect(() => {
    if (!navigationState?.key) return;
    if (isHydrating) return;
    const inAuthGroup = segments[0] === '(auth)';
    const atRoot = (segments as string[]).length === 0;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && (inAuthGroup || atRoot)) {
      router.replace('/(tabs)/feed');
    }
  }, [navigationState?.key, isAuthenticated, isHydrating, segments]);

  // 글꼴이 로드되기 전에는 배경색만 그린다(시스템 글꼴로 한 번 그렸다가 바뀌는 깜빡임 방지)
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[{ flex: 1, backgroundColor: c.bg }, themeVars]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Slot />
        {isHydrating && (
          <View style={{ position: 'absolute', inset: 0, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={c.value} />
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
