import { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Wordmark } from './Wordmark';
import { useColors } from '@/theme/useColors';

// 확정 UI S01 진입 로딩: 배경 + 워드마크 + 원형 스피너(트랙 surface2, 호 value)
export function LoadingView() {
  const c = useColors();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]} accessibilityLabel="불러오는 중">
      <Wordmark width={141} />
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={40} height={40} viewBox="0 0 40 40" fill="none" strokeWidth={3.5} strokeLinecap="round">
          <Circle cx={20} cy={20} r={16} stroke={c.surface2} />
          <Path d="M20 4a16 16 0 0 1 16 16" stroke={c.value} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 },
});
