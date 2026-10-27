import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useColors, useScheme } from '@/theme/useColors';

// Frost 서리 유리: 지도 위 시트·태그·칩·탭바에만 쓴다(목록 카드에는 쓰지 않는다).
// iOS는 네이티브 블러 위에 glass 색을 얹고, Android는 블러 없이 더 불투명한 단색으로 대신한다(D1).
const ANDROID_ALPHA = { dark: 0.92, light: 0.94 };

interface Props {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** 블러 세기(캔버스 blur 18px ≈ 40) */
  intensity?: number;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

export function Glass({ style, children, intensity = 40, pointerEvents }: Props) {
  const c = useColors();
  const scheme = useScheme();
  const base = [styles.base, { borderColor: c.glassBorder }];

  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint={scheme === 'dark' ? 'dark' : 'light'} pointerEvents={pointerEvents} style={[base, { backgroundColor: c.glass }, style]}>
        {children}
      </BlurView>
    );
  }
  return (
    <View pointerEvents={pointerEvents} style={[base, { backgroundColor: opaque(c.glass, ANDROID_ALPHA[scheme]) }, style]}>
      {children}
    </View>
  );
}

// 'rgba(r,g,b,a)'의 알파만 바꾼다
function opaque(rgba: string, alpha: number): string {
  return rgba.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, overflow: 'hidden' },
});
