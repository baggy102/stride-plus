import { useEffect, useRef } from 'react';
import { View, Animated, Easing, Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Wordmark } from './Wordmark';
import { useColors, useScheme } from '@/theme/useColors';
import { withAlpha } from '@/theme/colors';

// Frost S01 진입 로딩: 가운데 블루 글로우 + 워드마크 + 빛 띠(270×1) + 원형 스피너(트랙 hair, 호 value)
export function LoadingView() {
  const c = useColors();
  const dark = useScheme() === 'dark';
  // 글로우: 다크는 accent, 라이트는 logo 색을 옅게
  const glow = dark ? c.accent : c.logo;
  const glowAlpha = dark ? [0.34, 0.12] : [0.16, 0.06];
  const bandMid = dark ? c.text : c.value;
  const bandColors = [withAlpha(c.value, 0), withAlpha(c.value, dark ? 0.55 : 0.45), bandMid, withAlpha(c.value, dark ? 0.55 : 0.45), withAlpha(c.value, 0)] as const;
  const bandLocations = [0, 0.3, 0.5, 0.7, 1] as const;
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
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="49%" rx="80%" ry="42%">
            <Stop offset="0" stopColor={glow} stopOpacity={glowAlpha[0]} />
            <Stop offset="0.5" stopColor={glow} stopOpacity={glowAlpha[1]} />
            <Stop offset="1" stopColor={glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      <View style={styles.mark}>
        <Wordmark width={141} />
        <View style={styles.bandWrap}>
          {/* Android는 shadow* 속성을 그리지 않아 번짐이 없다 → 같은 그라데이션을 위아래로 옅게 한 겹씩 깐다 */}
          {Platform.OS === 'android' && (
            <>
              <LinearGradient start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} colors={bandColors} locations={bandLocations} style={[styles.halo, styles.haloTop]} />
              <LinearGradient start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} colors={bandColors} locations={bandLocations} style={[styles.halo, styles.haloBottom]} />
            </>
          )}
          <LinearGradient
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            colors={bandColors}
            locations={bandLocations}
            style={[styles.band, { shadowColor: c.value, shadowOpacity: dark ? 0.6 : 0.3 }]}
          />
        </View>
      </View>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={40} height={40} viewBox="0 0 40 40" fill="none" strokeWidth={3.5} strokeLinecap="round">
          <Circle cx={20} cy={20} r={16} stroke={c.hair} />
          <Path d="M20 4a16 16 0 0 1 16 16" stroke={c.value} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 },
  mark: { alignItems: 'center', gap: 16 },
  bandWrap: { width: 270, height: 1 },
  band: { width: 270, height: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  halo: { position: 'absolute', left: 0, width: 270, height: 6, opacity: 0.15 },
  haloTop: { top: -6 },
  haloBottom: { top: 1 },
});
