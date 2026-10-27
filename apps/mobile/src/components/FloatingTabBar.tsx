import type { ComponentProps, ReactElement } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Tabs } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { useColors } from '@/theme/useColors';
import { useRunStore } from '@/store/run';
import { FONT } from '@/theme/fonts';
import { Glass } from './Glass';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Frost 「주 메뉴」: 화면 아래 24px 위에 뜬 유리 알약, 아이콘 + 라벨 3개, 활성 탭은 navOn 색
const ICONS: Record<string, { label: string; text: string; draw: (color: string) => ReactElement }> = {
  feed: {
    label: '피드',
    text: '지도',
    draw: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round">
        <Path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z" />
        <Path d="M9 4v13.5M15 6.5V20" />
      </Svg>
    ),
  },
  record: {
    label: '기록',
    text: '기록 시작',
    draw: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
        <Circle cx={12} cy={13.5} r={7.5} />
        <Path d="M12 13.5V10M9.5 2.5h5M12 2.5V6" />
      </Svg>
    ),
  },
  profile: {
    label: '프로필',
    text: '내 기록',
    draw: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
        <Circle cx={12} cy={8} r={4} />
        <Path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
      </Svg>
    ),
  },
};

const BAR_HEIGHT = 68;
const barBottom = (safeBottom: number) => Math.max(safeBottom, 24);

// 탭 화면에서 탭바에 가리지 않으려면 이 값만큼 아래를 비운다(탭바 윗변까지의 거리)
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return barBottom(insets.bottom) + BAR_HEIGHT;
}

export function FloatingTabBar({ state, emitter, navigateToTab }: TabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  // 기록 중에는 숨긴다(확정 UI S06 기록 중 보드에 탭바 없음, 실수로 다른 탭으로 나가지 않게)
  const isTracking = useRunStore((s) => s.isTracking);
  if (isTracking) return null;

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.shadow, { bottom: barBottom(insets.bottom), shadowColor: c.shadow }]}
    >
      <Glass style={styles.bar}>
        {state.routes.map((route, index) => {
          const icon = ICONS[route.name];
          if (!icon) return null;
          const focused = state.index === index;
          const color = focused ? c.navOn : c.navOff;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={icon.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              style={styles.item}
            >
              {icon.draw(color)}
              <Text style={[styles.text, { color, fontFamily: focused ? FONT.semibold : FONT.regular }]}>{icon.text}</Text>
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  bar: {
    flex: 1,
    paddingHorizontal: 12,
    borderRadius: BAR_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  text: { fontSize: 12, lineHeight: 15 },
});
