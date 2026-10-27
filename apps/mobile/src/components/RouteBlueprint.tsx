import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Path, Polyline, RadialGradient, Stop, Text as SvgText, Line } from 'react-native-svg';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import { fitToBox, kmMarks, type LngLat } from '@/utils/route';

// Frost S07 경로 도면: 24px 격자 상자 안에 이번 경로를 맞춰 그리고 1 km마다 바깥쪽으로 눈금·라벨(1K, 2K…)
const CELL = 24;
const INSET = 22;

interface Props {
  coords: LngLat[];
  width: number;
  height: number;
}

export function RouteBlueprint({ coords, width, height }: Props) {
  const c = useColors();
  const tone = c.dark
    ? { marker: c.value, glow: 0.35, head: c.text, core: c.text }
    : { marker: c.value, glow: 0, head: c.logo, core: c.value };

  const drawing = useMemo(() => {
    const pts = fitToBox(coords, width, height, INSET);
    const marks = kmMarks(coords);
    // 눈금 위치도 같은 변환으로: 경로 점과 함께 맞춰야 상자 안 좌표가 일치한다
    const all = fitToBox([...coords, ...marks.flatMap((m) => [m.at, m.from, m.to])], width, height, INSET);
    const mk = all.slice(coords.length);
    const cx = width / 2;
    const cy = height / 2;
    const ticks = marks.map((m, i) => {
      const [x, y] = mk[i * 3];
      const [ax, ay] = mk[i * 3 + 1];
      const [bx, by] = mk[i * 3 + 2];
      let nx = -(by - ay);
      let ny = bx - ax;
      const n = Math.hypot(nx, ny) || 1;
      nx /= n; ny /= n;
      if (nx * (x - cx) + ny * (y - cy) < 0) { nx = -nx; ny = -ny; }
      return { label: `${m.km}K`, x1: x - nx * 5, y1: y - ny * 5, x2: x + nx * 5, y2: y + ny * 5, lx: x + nx * 16, ly: y + ny * 16 + 3.5 };
    });
    let grid = '';
    for (let x = 0; x <= width; x += CELL) grid += `M${x + 0.5} 0V${height}`;
    for (let y = 0; y <= height; y += CELL) grid += `M0 ${y + 0.5}H${width}`;
    return { pts, ticks, grid };
  }, [coords, width, height]);

  const { pts, ticks, grid } = drawing;
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const start = pts[0];
  const head = pts[pts.length - 1];
  // 1 km가 넘게 달렸는데 눈금이 많으면 라벨이 겹친다 → 10개를 넘으면 짝수 km만
  const shown = ticks.length > 10 ? ticks.filter((_, i) => (i + 1) % 2 === 0) : ticks;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`이번 러닝 경로 도면${ticks.length ? `, 1km마다 눈금 ${ticks.length}개` : ''}`}
      style={{ width, height, borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.grid }}
    >
      <Svg width={width} height={height} style={{ overflow: 'visible' }}>
        <Defs>
          <RadialGradient id="bp-head">
            <Stop offset="0" stopColor={tone.head} stopOpacity={0.9} />
            <Stop offset="1" stopColor={tone.head} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={grid} stroke={c.grid} strokeWidth={1} fill="none" />
        {pts.length > 1 && (
          <>
            {tone.glow > 0 && <Polyline points={line} fill="none" stroke={tone.marker} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={tone.glow} />}
            <Polyline points={line} fill="none" stroke={tone.marker} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {shown.map((k) => (
          <Line key={`l${k.label}`} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} stroke={c.text} strokeWidth={1} />
        ))}
        {shown.map((k) => (
          <SvgText key={`t${k.label}`} x={k.lx} y={k.ly} fill={c.text} fontFamily={FONT.monoMedium} fontSize={10} letterSpacing={0.4} textAnchor="middle">
            {k.label}
          </SvgText>
        ))}
        {start && <Circle cx={start[0]} cy={start[1]} r={4} fill={c.bg} stroke={tone.marker} strokeWidth={2} />}
        {head && pts.length > 1 && <Circle cx={head[0]} cy={head[1]} r={20} fill="url(#bp-head)" />}
        {head && pts.length > 1 && <Circle cx={head[0]} cy={head[1]} r={4} fill={tone.core} />}
      </Svg>
    </View>
  );
}
