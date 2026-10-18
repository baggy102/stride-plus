import { useMemo } from 'react';
import {
  View, Text, Pressable, Image, FlatList, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { AlertIcon, RouteIcon } from '@/components/icons';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';
import type { RunMarker } from '../RunCard';
import { formatPace } from '@/utils/pace';

export interface RunWithRoute extends RunMarker {
  route: [number, number][];
}

export type ListState = 'loading' | 'error' | 'ready';

interface Props {
  runs: RunWithRoute[];
  state: ListState;
  baseUrl: string;
  mine: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  topInset: number;
  bottomInset: number;
  onRefresh: () => void;
  onEndReached: () => void;
  onRetry: () => void;
  onRunPress: (runId: string) => void;
  onStartRun: () => void;
}

const THUMB = 96;
const THUMB_PADDING = 14;

// 서버에 시간 필드가 없어 페이스 × 거리로 계산한다(B4와 같음)
function formatDuration(paceSecPerKm: number, distanceKm: number) {
  const total = Math.round(paceSecPerKm * distanceKm);
  if (!total) return '--:--';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// [lng, lat] 경로를 썸네일 상자 안 좌표로. 위도 보정으로 모양을 유지하고 북쪽이 위
function toThumbPoints(route: [number, number][]) {
  if (route.length < 2) return null;
  const cosLat = Math.cos((route[0][1] * Math.PI) / 180);
  const xs = route.map(([lng]) => lng * cosLat);
  const ys = route.map(([, lat]) => lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (THUMB - THUMB_PADDING * 2) / span;
  const offsetX = (THUMB - (maxX - minX) * scale) / 2;
  const offsetY = (THUMB - (maxY - minY) * scale) / 2;
  return xs.map((x, i) => [offsetX + (x - minX) * scale, THUMB - (offsetY + (ys[i] - minY) * scale)] as const);
}

function RouteThumb({ route, c }: { route: [number, number][]; c: Palette }) {
  const points = useMemo(() => toThumbPoints(route), [route]);
  if (!points) {
    return <View style={{ width: THUMB, height: THUMB, borderRadius: 12, backgroundColor: c.surface2 }} />;
  }
  const [start, end] = [points[0], points[points.length - 1]];
  return (
    <View style={{ width: THUMB, height: THUMB, borderRadius: 12, overflow: 'hidden', backgroundColor: c.map.bg }}>
      <Svg width={THUMB} height={THUMB}>
        <Polyline
          points={points.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none" stroke={c.map.dot} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
        />
        <Circle cx={start[0]} cy={start[1]} r={4} fill={c.map.bg} stroke={c.map.dot} strokeWidth={2} />
        <Circle cx={end[0]} cy={end[1]} r={3.5} fill={c.map.dot} />
      </Svg>
    </View>
  );
}

function RunItem({ run, baseUrl, c, styles, onPress }: {
  run: RunWithRoute; baseUrl: string; c: Palette; styles: ReturnType<typeof makeStyles>; onPress: () => void;
}) {
  const date = new Date(run.createdAt).toLocaleDateString('ko-KR');
  const pace = formatPace(run.paceSecPerKm);
  const time = formatDuration(run.paceSecPerKm, run.distanceKm);
  const photoCount = run.photoUrls.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${run.description?.trim() || '러닝 기록'}, ${date} 러닝 ${run.distanceKm.toFixed(2)} km, 페이스 ${pace}, 시간 ${time}${photoCount ? `, 사진 ${photoCount}장` : ''}`}
      onPress={onPress}
      // 함수형 style은 NativeWind interop에서 적용되지 않아 정적 style을 쓴다
      style={styles.card}
    >
      <RouteThumb route={run.route} c={c} />
      <View style={styles.cardBody}>
        <View style={photoCount > 0 && styles.besidePhoto}>
          <Text style={styles.title} numberOfLines={1}>{run.description?.trim() || '러닝 기록'}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
        <Text style={styles.distance}>
          {run.distanceKm.toFixed(2)}
          <Text style={styles.distanceUnit}> KM</Text>
        </Text>
        <View style={styles.metrics}>
          <View>
            <Text style={styles.metricLabel}>Avg Pace</Text>
            <Text style={styles.metricValue}>{pace}</Text>
          </View>
          <View>
            <Text style={styles.metricLabel}>Time</Text>
            <Text style={styles.metricValue}>{time}</Text>
          </View>
        </View>
      </View>
      {photoCount > 0 && (
        <View style={styles.photo}>
          <Image source={{ uri: `${baseUrl}${run.photoUrls[0]}` }} style={StyleSheet.absoluteFillObject} />
          {photoCount > 1 && (
            <View style={styles.photoMore}>
              <Text style={styles.photoMoreText}>+{photoCount - 1}</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

// 확정 UI S08/S09 목록 보기 — 카드 + 로딩·빈·오류·새로고침·다음 페이지 상태
export function RunList(props: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { runs, state, mine, topInset, bottomInset } = props;
  const contentStyle = { paddingTop: topInset + 4, paddingBottom: bottomInset, paddingHorizontal: 16, gap: 10 };

  if (state === 'loading') {
    return (
      <View accessibilityLabel="러닝 기록을 불러오는 중" style={contentStyle}>
        {[1, 0.8, 0.6, 0.4].map((opacity) => (
          <View key={opacity} style={[styles.card, { opacity }]}>
            <View style={[styles.skeleton, { width: THUMB, height: THUMB, borderRadius: 12 }]} />
            <View style={[styles.cardBody, { paddingVertical: 4 }]}>
              <View style={[styles.skeleton, { width: 84, height: 12 }]} />
              <View style={[styles.skeleton, { width: 112, height: 24, borderRadius: 8 }]} />
              <View style={[styles.skeleton, { width: 150, height: 14 }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (state === 'error' || runs.length === 0) {
    const isError = state === 'error';
    return (
      <View accessibilityRole={isError ? 'alert' : undefined} style={[styles.center, { paddingTop: topInset, paddingBottom: bottomInset }]}>
        <View style={styles.stateIcon}>
          {isError ? <AlertIcon size={28} color={c.text2} /> : <RouteIcon size={28} color={c.text2} />}
        </View>
        <Text style={styles.stateTitle}>{isError ? '불러오지 못했어요' : '아직 러닝 기록이 없어요'}</Text>
        {isError ? (
          <Pressable accessibilityRole="button" onPress={props.onRetry} style={styles.ghostBtn}>
            <Text style={styles.ghostText}>다시 시도</Text>
          </Pressable>
        ) : mine ? (
          <Pressable accessibilityRole="button" onPress={props.onStartRun} style={styles.accentBtn}>
            <Text style={styles.accentText}>첫 러닝 시작하기</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <FlatList
      accessibilityLabel="러닝 기록"
      data={runs}
      keyExtractor={(run) => run._id}
      renderItem={({ item }) => (
        <RunItem run={item} baseUrl={props.baseUrl} c={c} styles={styles} onPress={() => props.onRunPress(item._id)} />
      )}
      contentContainerStyle={contentStyle}
      refreshControl={
        <RefreshControl
          refreshing={props.refreshing}
          onRefresh={props.onRefresh}
          tintColor={c.value}
          colors={[c.value]}
          progressViewOffset={topInset}
        />
      }
      onEndReached={props.onEndReached}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        props.loadingMore ? (
          <View accessibilityLabel="다음 기록 불러오는 중" style={styles.footer}>
            <ActivityIndicator color={c.value} />
          </View>
        ) : null
      }
    />
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  card: {
    padding: 12, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    flexDirection: 'row', gap: 14,
  },
  cardBody: { flex: 1, minWidth: 0, paddingVertical: 2, gap: 4 },
  besidePhoto: { paddingRight: 56 },
  title: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20, color: c.text },
  date: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, color: c.text2 },
  distance: { fontFamily: FONT.num, fontSize: 24, lineHeight: 28, color: c.value },
  distanceUnit: { fontFamily: FONT.num, fontSize: 14, color: c.text2 },
  metrics: { flexDirection: 'row', gap: 18 },
  metricLabel: { fontFamily: FONT.semibold, fontSize: 11, lineHeight: 15, color: c.text2 },
  metricValue: { fontFamily: FONT.num, fontSize: 15, lineHeight: 20, color: c.text },
  photo: { position: 'absolute', right: 12, top: 12, width: 48, height: 48, borderRadius: 10, overflow: 'hidden', backgroundColor: c.surface2 },
  photoMore: {
    position: 'absolute', right: 0, bottom: 0, height: 20, paddingHorizontal: 6, borderTopLeftRadius: 8,
    backgroundColor: 'rgba(10,12,14,0.72)', justifyContent: 'center',
  },
  photoMoreText: { fontFamily: FONT.numBold, fontSize: 12, color: '#FFFFFF' },
  skeleton: { height: 12, borderRadius: 6, backgroundColor: c.surface2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  stateIcon: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  stateTitle: { marginTop: 4, fontFamily: FONT.semibold, fontSize: 17, lineHeight: 24, color: c.text },
  accentBtn: { marginTop: 8, height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: c.accent, justifyContent: 'center' },
  accentText: { fontFamily: FONT.semibold, fontSize: 15, color: c.ink },
  ghostBtn: {
    marginTop: 8, height: 48, paddingHorizontal: 24, borderRadius: 24, justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  ghostText: { fontFamily: FONT.semibold, fontSize: 15, color: c.text },
  footer: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
