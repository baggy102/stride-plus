import { StyleSheet, View } from 'react-native';
import { BlendMode, Canvas, Picture, Skia, StrokeCap, TileMode, createPicture } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  DUST_SCALE, DUST_TIMELINE, KIND_CORE, KIND_SPARK, KIND_TARGET,
  dustAlpha, dustKind, dustPos, seg, sine, type Dust,
} from '@/utils/dust';
import type { Palette } from '@/theme/colors';

interface Props {
  dust: Dust;
  /** 경과 시간(실제 ms). 요약 화면의 다른 요소와 같은 시계를 쓴다 */
  clock: SharedValue<number>;
  /** 기록 중 화면의 지금 위치(점 구름의 마지막 점) — 들숨에 밝아졌다 흩어짐과 함께 사라진다 */
  head: [number, number] | null;
  width: number;
  height: number;
  c: Palette;
}

/**
 * 러닝 종료 전환의 가루 레이어(Skia, UI 스레드에서 매 프레임 그린다).
 * 점 구름이 들숨처럼 모였다 흩어지고, 구간별 페이스 막대로 흘러내려 쌓인 뒤 막대로 굳으며 사라진다.
 * 다크는 겹칠수록 밝아지는 얼음빛(Plus 합성), 라이트는 맑은 파란 가루.
 */
export function DustTransition({ dust, clock, head, width, height, c }: Props) {
  const { buf, count, cx, cy } = dust;
  const { ice, ice2, spark } = c.dust;
  const headColor = c.dark ? c.text : c.value;
  const dark = c.dark;

  const picture = useDerivedValue(() => {
    const t = clock.value * DUST_SCALE;
    return createPicture((canvas) => {
      if (t >= DUST_TIMELINE) return;
      // 지금 위치 글로우: 들숨(0~350)에 커지고 350~1200에 사라진다
      if (head) {
        const g = sine(seg(t, 0, 350));
        const a = 1 - sine(seg(t, 350, 1200));
        if (a > 0) {
          const r = 24 + 22 * g;
          const glow = Skia.Paint();
          glow.setShader(Skia.Shader.MakeRadialGradient(
            Skia.Point(head[0], head[1]), r, [Skia.Color(headColor), Skia.Color('rgba(157,191,224,0)')], null, TileMode.Clamp,
          ));
          glow.setAlphaf(a * 0.9);
          canvas.drawCircle(head[0], head[1], r, glow);
        }
      }
      const settle = 1 - sine(seg(t, 4300, 5100));
      if (settle <= 0) return;
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setStrokeCap(StrokeCap.Round);
      if (dark) paint.setBlendMode(BlendMode.Plus);
      const colIce = Skia.Color(ice), colIce2 = Skia.Color(ice2), colSpark = Skia.Color(spark);
      const out = [0, 0, 0, 0];
      const prev = [0, 0, 0, 0];
      for (let i = 0; i < count; i++) {
        dustPos(buf, i, t, cx, cy, out);
        const u = out[2];
        const a = dustAlpha(buf, i, u, out[3], settle);
        if (a <= 0.01) continue;
        const kind = dustKind(buf, i);
        const target = (kind & KIND_TARGET) !== 0;
        const sz = u > 0 ? 1.9 + (1.6 - 1.9) * (1 - Math.pow(1 - u, 3)) : (kind & KIND_CORE) !== 0 ? 2.4 : 1.6;
        paint.setColor((kind & KIND_SPARK) !== 0 ? colSpark : (kind & KIND_CORE) !== 0 || (u >= 1 && target) ? colIce : colIce2);
        paint.setAlphaf(dark ? a * 0.85 : a);
        if (u > 0 && u < 1) {
          // 흘러내리는 중: 짧은 꼬리(26ms 전 위치 → 지금)
          dustPos(buf, i, t - 26 * DUST_SCALE, cx, cy, prev);
          paint.setStrokeWidth(sz);
          canvas.drawLine(prev[0], prev[1], out[0], out[1], paint);
        } else {
          canvas.drawCircle(out[0], out[1], sz / 2, paint);
        }
      }
    }, Skia.XYWHRect(0, 0, width, height));
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
