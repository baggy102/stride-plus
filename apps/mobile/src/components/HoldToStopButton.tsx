import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import { PlayIcon } from '@/components/icons';
import { Glass } from '@/components/Glass';

// Frost S06 「종료 A」: 서리 유리 원형 버튼(달리는 중 ‖, 일시정지 중 ▶). 길게 누르면 진행 링이 차고, 다 차면 종료.
// 손을 떼면 취소된다(실수로 한 번 눌러서는 끝나지 않게). 짧게 탭하면 일시정지/재개(B7). 링만 강조색.
const HOLD_MS = 1500;
const TAP_MS = 300;
const SIZE = 104;
const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  onComplete: () => void;
  /** 짧게 탭 — 일시정지 또는 재개 */
  onTap: () => void;
  paused: boolean;
}

export function HoldToStopButton({ onComplete, onTap, paused }: Props) {
  const c = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const pressedAt = useRef(0);

  const begin = () => {
    pressedAt.current = Date.now();
    setHolding(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setHolding(false);
        progress.setValue(0);
        onComplete();
      }
    });
  };

  const cancel = () => {
    if (Date.now() - pressedAt.current < TAP_MS) onTap();
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    setHolding(false);
  };

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [CIRCUMFERENCE, 0] });

  return (
    <View style={styles.wrap}>
      <View style={styles.ringBox}>
        {holding && (
          <Svg width={SIZE} height={SIZE} style={styles.ring}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={c.stop.track} strokeWidth={4} fill="none" />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={c.stop.ring}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={dashOffset}
            />
          </Svg>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? '탭해서 다시 시작, 길게 눌러 러닝 종료' : '탭해서 일시정지, 길게 눌러 러닝 종료'}
          onPressIn={begin}
          onPressOut={cancel}
          style={[
            styles.shadow,
            { shadowOpacity: c.dark ? 0 : 0.1, shadowColor: c.shadow, transform: [{ scale: holding ? 0.94 : 1 }] },
          ]}
        >
          <Glass style={[styles.button, { borderColor: c.dark ? 'rgba(220,230,238,0.22)' : 'rgba(11,16,22,0.10)' }]}>
            {paused ? (
              <PlayIcon color={c.text} />
            ) : (
              <View style={styles.bars}>
                <View style={[styles.bar, { backgroundColor: c.text }]} />
                <View style={[styles.bar, { backgroundColor: c.text }]} />
              </View>
            )}
          </Glass>
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: holding ? c.text : c.text2 }]}>
        {holding ? '계속 누르고 있으면 종료돼요' : paused ? '탭하면 다시 시작 · 길게 누르면 종료' : '탭하면 일시정지 · 길게 누르면 종료'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  ringBox: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  shadow: { width: 84, height: 84, borderRadius: 42, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  button: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', gap: 8 },
  bar: { width: 7, height: 24, borderRadius: 1 },
  hint: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18 },
});
