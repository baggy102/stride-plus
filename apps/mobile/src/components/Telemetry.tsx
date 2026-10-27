import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '@/theme/useColors';
import { monoLabel } from '@/theme/fonts';
import type { LngLat } from '@/utils/route';

// Frost 기록 화면(S06)의 텔레메트리 요소: 24px 격자 위 경로 점 구름 + 지금 위치 글로우, 좌표 줄
const CELL = 24;
const MAX_DOTS = 320;
const INSET = 24;
const ICE = '#9DBFE0';

/** 경로를 상자 안에 비율을 지켜 맞춘다(위도 보정한 평면 근사). 점이 하나뿐이면 가운데 */
function project(coords: LngLat[], width: number, height: number): [number, number][] {
  if (coords.length === 0) return [];
  const lat0 = coords[0][1] * (Math.PI / 180);
  const xs = coords.map(([lng]) => lng * Math.cos(lat0));
  const ys = coords.map(([, lat]) => lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const boxW = width - INSET * 2;
  const boxH = height - INSET * 2;
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(boxW / (spanX || Infinity), boxH / (spanY || Infinity));
  const offX = INSET + (boxW - spanX * scale) / 2;
  const offY = INSET + (boxH - spanY * scale) / 2;
  return xs.map((x, i) => [offX + (x - minX) * scale, offY + (maxY - ys[i]) * scale]);
}

/** 오래된 점은 옅게. 점이 많으면 고르게 줄이고 마지막 점은 남긴다 */
function sample<T>(items: T[]): T[] {
  if (items.length <= MAX_DOTS) return items;
  const step = items.length / MAX_DOTS;
  const out: T[] = [];
  for (let i = 0; i < MAX_DOTS - 1; i++) out.push(items[Math.floor(i * step)]);
  out.push(items[items.length - 1]);
  return out;
}

interface GridProps {
  coords: LngLat[];
  width: number;
  height: number;
  /** 지금 위치 점이 숨 쉬듯 퍼진다(일시정지·대기 전에는 멈춤) */
  pulse: boolean;
  /** 경로가 없을 때도 가운데 지금 위치를 보여 줄지(시작 전) */
  showHead: boolean;
  accessibilityLabel: string;
}

export function TelemetryGrid({ coords, width, height, pulse, showHead, accessibilityLabel }: GridProps) {
  const c = useColors();
  // 글로우 바깥은 두 테마 모두 Ice(#9DBFE0)
  const tone = c.dark
    ? { gridLine: 'rgba(220,230,238,0.06)', dot: c.value, head: c.text, glow: ICE, core: c.text }
    : { gridLine: 'rgba(11,16,22,0.06)', dot: c.value, head: c.logo, glow: ICE, core: c.value };

  const gridD = useMemo(() => {
    let d = '';
    for (let x = INSET; x <= width - INSET; x += CELL) d += `M${x + 0.5} 0V${height}`;
    for (let y = 0; y <= height; y += CELL) d += `M${INSET} ${y + 0.5}H${width - INSET}`;
    return d;
  }, [width, height]);

  const dots = useMemo(() => sample(project(coords, width, height)), [coords, width, height]);
  const head = dots.length > 0 ? dots[dots.length - 1] : showHead ? [width / 2, height / 2] : null;

  const spread = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse || !head) { spread.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(spread, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse, head !== null, spread]);

  return (
    <View style={{ width, height }} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="tele-head">
            <Stop offset="0" stopColor={tone.head} stopOpacity={0.9} />
            <Stop offset="1" stopColor={tone.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={gridD} stroke={tone.gridLine} strokeWidth={1} fill="none" />
        {dots.map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={1.5} fill={tone.dot} opacity={0.18 + (0.82 * i) / Math.max(1, dots.length - 1)} />
        ))}
        {head && <Circle cx={head[0]} cy={head[1]} r={24} fill="url(#tele-head)" />}
        {head && <Circle cx={head[0]} cy={head[1]} r={3.5} fill={tone.core} />}
      </Svg>
      {head && pulse && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulse,
            {
              left: head[0] - 7,
              top: head[1] - 7,
              backgroundColor: tone.head,
              opacity: spread.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: spread.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
            },
          ]}
        />
      )}
    </View>
  );
}

/** 「N 37.2751   E 127.1162」 */
export function CoordLine({ at }: { at: LngLat | undefined }) {
  const c = useColors();
  if (!at) return null;
  const [lng, lat] = at;
  const ns = `${lat >= 0 ? 'N' : 'S'} ${Math.abs(lat).toFixed(4)}`;
  const ew = `${lng >= 0 ? 'E' : 'W'} ${Math.abs(lng).toFixed(4)}`;
  return (
    <View style={styles.coordRow} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={[styles.coord, { color: c.navOff }]}>{ns}</Text>
      <Text style={[styles.coord, { color: c.navOff }]}>{ew}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pulse: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  coordRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 26 },
  coord: { ...monoLabel(9, 0.04), lineHeight: 12 },
});
