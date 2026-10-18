import type { ComponentProps, ReactElement } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Tabs } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { useColors } from '@/theme/useColors';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// 확정 UI 캔버스 「주 메뉴」: 화면 아래 24px 위에 뜬 알약형, 아이콘 3개, 활성 탭은 accent 원
const ICONS: Record<string, { label: string; draw: (color: string) => ReactElement }> = {
  feed: {
    label: '피드',
    draw: (color) => (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round">
        <Path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z" />
        <Path d="M9 4v13.5M15 6.5V20" />
      </Svg>
    ),
  },
  record: {
    label: '기록',
    draw: (color) => (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
        <Circle cx={12} cy={13.5} r={7.5} />
        <Path d="M12 13.5V10M9.5 2.5h5M12 2.5V6" />
      </Svg>
    ),
  },
  profile: {
    label: '프로필',
    draw: (color) => (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
        <Circle cx={12} cy={8} r={4} />
        <Path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
      </Svg>
    ),
  },
};

const BAR_HEIGHT = 64;
const barBottom = (safeBottom: number) => Math.max(safeBottom, 24);

// 탭 화면에서 탭바에 가리지 않으려면 이 값만큼 아래를 비운다(탭바 윗변까지의 거리)
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return barBottom(insets.bottom) + BAR_HEIGHT;
}

export function FloatingTabBar({ state, navigation }: TabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          bottom: barBottom(insets.bottom),
          backgroundColor: c.surface,
          borderColor: c.border,
          shadowColor: c.shadow,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const icon = ICONS[route.name];
        if (!icon) return null;
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={icon.label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={[styles.item, focused && { backgroundColor: c.accent }]}
          >
            {icon.draw(focused ? c.ink : c.muted)}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: BAR_HEIGHT,
    paddingHorizontal: 28,
    borderRadius: 32,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  item: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
