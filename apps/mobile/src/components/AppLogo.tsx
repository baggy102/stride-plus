import { Text, StyleSheet } from 'react-native';

interface Props {
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 앱 로고 공유 컴포넌트.
 * 폰트 교체 시 여기 fontFamily 하나만 변경하면 전 페이지 반영됨.
 */
export function AppLogo({ size = 'md' }: Props) {
  const fontSize = size === 'sm' ? 18 : size === 'lg' ? 32 : 24;
  return (
    <Text style={[styles.logo, { fontSize, letterSpacing: fontSize * 0.28 }]}>
      STRIDE+
    </Text>
  );
}

const styles = StyleSheet.create({
  logo: {
    color: '#F5F5F5',
    fontWeight: '900',
  },
});
