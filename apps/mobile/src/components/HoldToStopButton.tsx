import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';

// 확정 UI S06 「종료 A · 강조색」: 원형 버튼을 길게 누르면 진행 링이 차고, 다 차면 종료.
// 손을 떼면 취소된다(실수로 한 번 눌러서는 끝나지 않게).
const HOLD_MS = 1500;
const SIZE = 104;
const RADIUS = 48;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  onComplete: () => void;
}

export function HoldToStopButton({ onComplete }: Props) {
  const c = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);

  const begin = () => {
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
          accessibilityLabel="길게 눌러 러닝 종료"
          onPressIn={begin}
          onPressOut={cancel}
          style={[
            styles.button,
            { backgroundColor: c.accent, borderColor: c.stop.edge, transform: [{ scale: holding ? 0.94 : 1 }] },
          ]}
        >
          <View style={[styles.square, { backgroundColor: c.ink }]} />
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: holding ? c.text : c.text2 }]}>
        {holding ? '계속 누르고 있으면 종료돼요' : '길게 눌러 종료'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  ringBox: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  button: {
    width: 84, height: 84, borderRadius: 42, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  square: { width: 22, height: 22, borderRadius: 4 },
  hint: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18 },
});
