import { useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { RouteMap } from '@/components/RouteMap';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import { withAlpha, type Palette } from '@/theme/colors';
import { fitToBox } from '@/utils/route';
import { formatDate } from '@/utils/date';

// 매거진형 피드(S08) · 러닝 상세(S10) · 캘린더 한 줄 카드가 같이 쓰는 카드 부품(2026-11-15 확정 시안 16차)
export const CARD_HEAD = 64; // 펼친 카드 위 한 줄 = 접힌 한 줄 높이
export const CARD_FULL = 410;
export const CARD_MEDIA = CARD_FULL - CARD_HEAD;
export const CARD_RADIUS = 26;

export interface FeedRun {
  _id: string;
  distanceKm: number;
  paceSecPerKm: number;
  photoUrls: string[];
  /** 코스 소개 — 첫 줄을 카드 이름으로 쓴다 */
  description?: string;
  createdAt: string;
  /** [lng, lat] */
  route: [number, number][];
}

export const titleOf = (run: Pick<FeedRun, 'description'>) => run.description?.trim().split('\n')[0] || '러닝 기록';

// 경로 선(출발 링 · 도착 점). 미니 지도 · 지도 불러오기 전 자리에 쓴다
export function RouteSketch({ route, width, height, inset, stroke, strokeWidth = 2 }: {
  route: [number, number][]; width: number; height: number; inset: number; stroke: string; strokeWidth?: number;
}) {
  const pts = useMemo(() => fitToBox(route, width, height, inset), [route, width, height, inset]);
  if (pts.length < 2) return null;
  const end = pts[pts.length - 1];
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={pts[0][0]} cy={pts[0][1]} r={strokeWidth * 1.3} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.75} />
      <Circle cx={end[0]} cy={end[1]} r={strokeWidth * 1.3} fill={stroke} />
    </Svg>
  );
}

function useCardStyles() {
  const c = useColors();
  return { c, s: useMemo(() => makeStyles(c), [c]) };
}

/** 펼친 카드 내용(위 한 줄 64 + 사진 또는 지도 346). 높이 · 모서리는 감싸는 쪽이 정한다 */
export function ExpandedCard({ run, baseUrl, liveMap, pager = false, mini = true, width }: {
  run: FeedRun;
  baseUrl: string;
  /** 사진 없는 기록의 지도를 실제 지도(WebView)로 그릴지. 아니면 지도 바탕 위 경로 선만 */
  liveMap: boolean;
  /** 사진이 여러 장이면 옆으로 넘김(상세) */
  pager?: boolean;
  /** 사진 있는 기록의 위 한 줄 오른쪽 미니 경로(피드만, 상세는 아래 지도 카드가 있어 뺀다) */
  mini?: boolean;
  width: number;
}) {
  const { c, s } = useCardStyles();
  const photo = run.photoUrls[0];
  return (
    <View style={s.full}>
      <View style={s.head}>
        <Text style={s.line} numberOfLines={1}>
          <Text style={s.name}>{titleOf(run)}</Text>
          {`   ${formatDate(run.createdAt)}`}
        </Text>
        {photo && mini && (
          <View style={s.mini} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <RouteSketch route={run.route} width={44} height={44} inset={8} stroke={c.value} strokeWidth={1.8} />
          </View>
        )}
      </View>
      {photo ? (
        <PhotoMedia run={run} baseUrl={baseUrl} pager={pager} width={width} s={s} />
      ) : (
        <View style={s.media}>
          <View style={[StyleSheet.absoluteFill, s.mapBg]}>
            <RouteSketch route={run.route} width={width} height={CARD_MEDIA} inset={48} stroke={c.value} strokeWidth={3.5} />
          </View>
          {liveMap && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <RouteMap coordinates={run.route} fit="route" style={StyleSheet.absoluteFill} />
            </View>
          )}
          <LinearGradient colors={[withAlpha(c.map.bg, 0), withAlpha(c.map.bg, 0.97)]} style={s.fade} pointerEvents="none" />
          <Distance km={run.distanceKm} s={s} onMap />
        </View>
      )}
    </View>
  );
}

function PhotoMedia({ run, baseUrl, pager, width, s }: {
  run: FeedRun; baseUrl: string; pager: boolean; width: number; s: ReturnType<typeof makeStyles>;
}) {
  const [page, setPage] = useState(0);
  const urls = pager ? run.photoUrls : run.photoUrls.slice(0, 1);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  return (
    <View style={s.media}>
      <ScrollView
        horizontal
        pagingEnabled
        scrollEnabled={urls.length > 1}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        accessibilityLabel={`사진 ${run.photoUrls.length}장`}
      >
        {urls.map((url) => (
          <Image key={url} source={{ uri: `${baseUrl}${url}` }} style={{ width, height: CARD_MEDIA }} resizeMode="cover" />
        ))}
      </ScrollView>
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={s.shade} pointerEvents="none" />
      <Distance km={run.distanceKm} s={s} />
      {urls.length > 1 && (
        <View style={s.dots} pointerEvents="none">
          {urls.map((url, i) => <View key={url} style={[s.dot, i === page && s.dotOn]} />)}
        </View>
      )}
    </View>
  );
}

// 큰 거리 숫자 + 모노 KM(포스터 카드 · 요약과 같은 라벨)
function Distance({ km, s, onMap = false }: { km: number; s: ReturnType<typeof makeStyles>; onMap?: boolean }) {
  return (
    <View style={s.kmBox} accessible accessibilityLabel={`${km.toFixed(2)} km`}>
      <Text style={[s.km, onMap && s.kmOnMap]}>{km.toFixed(2)}</Text>
      <Text style={[s.kmUnit, onMap && s.kmUnitOnMap]}>KM</Text>
    </View>
  );
}

/** 접힌 한 줄(64): 날짜 배지 · 이름 · 거리. 피드 지난 카드 · 캘린더 한 줄 카드 */
export function CollapsedRow({ run }: { run: FeedRun }) {
  const { s } = useCardStyles();
  const d = new Date(run.createdAt);
  return (
    <View style={s.row}>
      <View style={s.badge}>
        <Text style={s.badgeDay}>{d.getDate()}</Text>
        <Text style={s.badgeMonth}>{`${d.getMonth() + 1}월`}</Text>
      </View>
      <Text style={s.rowName} numberOfLines={1}>{titleOf(run)}</Text>
      <View style={s.rowDist}>
        <Text style={s.rowKm}>{run.distanceKm.toFixed(2)}</Text>
        <Text style={s.rowUnit}>KM</Text>
      </View>
    </View>
  );
}

const WHITE = '#FFFFFF';

const makeStyles = (c: Palette) => StyleSheet.create({
  full: { height: CARD_FULL },
  head: { height: CARD_HEAD, paddingLeft: 20, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, minWidth: 0, fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, color: c.text2 },
  name: { fontFamily: FONT.semibold, fontSize: 15, color: c.text },
  mini: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: c.map.bg },
  media: { height: CARD_MEDIA, overflow: 'hidden', backgroundColor: c.surface2 },
  mapBg: { backgroundColor: c.map.bg },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  kmBox: { position: 'absolute', left: 20, bottom: 14, flexDirection: 'row', alignItems: 'baseline' },
  km: { fontFamily: FONT.num, fontSize: 56, lineHeight: 60, letterSpacing: -1.5, color: WHITE, fontVariant: ['tabular-nums'] },
  kmOnMap: { color: c.text },
  kmUnit: { ...monoLabel(13, 0.08), marginLeft: 5, color: 'rgba(255,255,255,0.82)' },
  kmUnitOnMap: { color: c.text2 },
  dots: { position: 'absolute', right: 20, bottom: 30, flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { backgroundColor: WHITE },
  row: { height: CARD_HEAD, paddingLeft: 12, paddingRight: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', gap: 2 },
  badgeDay: { fontFamily: FONT.num, fontSize: 17, lineHeight: 18, color: c.text },
  badgeMonth: { fontFamily: FONT.regular, fontSize: 10, lineHeight: 12, color: c.text2 },
  rowName: { flex: 1, minWidth: 0, fontFamily: FONT.semibold, fontSize: 15, color: c.text },
  rowDist: { flexDirection: 'row', alignItems: 'baseline' },
  rowKm: { fontFamily: FONT.num, fontSize: 19, color: c.text, fontVariant: ['tabular-nums'] },
  rowUnit: { ...monoLabel(11, 0.08), marginLeft: 3, color: c.text2 },
});
