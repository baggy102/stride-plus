import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import type { RunMarker } from '@/types/run';
import { ChevronIcon, CloseIcon, HeartIcon } from '../icons';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import { elevationStyle, type Palette } from '@/theme/colors';
import { formatDuration, formatRunPace } from '@/utils/pace';
import { formatClock, formatDay } from '@/utils/date';
import { fitToBox, type LngLat } from '@/utils/route';
import { useReducedMotion } from '@/utils/motion';
import client from '@/api/client';
import { posterStickers, STICKER_LABEL, type StickerKind } from './stickers';

interface Props {
  run: RunMarker;
  baseUrl: string;
  onClose: () => void;
  onUserPress?: (userId: string) => void;
  /** 카드(사진·›)를 누르면 러닝 상세(S10)로 */
  onDetailPress?: (runId: string) => void;
  /** 화면 아래에서 띄울 거리. 탭 화면은 탭바 위로 올린다 */
  bottom?: number;
  /** 경로(받았으면): 사진이 없으면 크게, 있으면 오른쪽 위에 작게 */
  route?: LngLat[];
  /** 경로 색(지도 위 경로와 같게). 없으면 value */
  routeColor?: string;
  /** 내 러닝이면 응원 버튼 대신 받은 수만 */
  mine?: boolean;
  onCheered?: (runId: string, cheers: number, cheered: boolean) => void;
}

/** 카드 높이: 사진 178 + 이름 줄 60 + 수치 줄 50 */
export const POSTER_HEIGHT = 288;
const MEDIA_H = 178;
const ENTER_EASE = Easing.bezier(0.16, 1, 0.3, 1);
const EXIT_EASE = Easing.bezier(0.7, 0, 0.84, 0);

const pathD = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

// 투명도 + 아래에서 lift px. 들어올 때만 쓴다
function useRise(v: SharedValue<number>, lift: number) {
  return useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * lift }] }));
}

/**
 * 고른 러닝의 포스터 카드(2026-11-19 확정, 지도 피드 프로토타입 v8 개선안). 지도 피드·내 피드 공용, WebView 밖 네이티브.
 * 사진(없으면 경로) 위 큰 거리 + 스티커 최대 2개 / 작성자 · 날짜 · 시각 / TIME · PACE · CHEER(응원 버튼).
 * 들어올 때: 카드 0.22초 뒤 올라옴 → 사진 → 거리 → 스티커 → 글자. 닫을 때 0.24초에 내려간다
 */
export function MapPopupCard({ run, baseUrl, onClose, onUserPress, onDetailPress, bottom = 24, route, routeColor, mine = false, onCheered }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduced = useReducedMotion();
  const username = run.userId.username || '알 수 없음';
  const title = run.description?.trim() || '러닝 기록';
  const avatar = run.userId.profileImageUrl;
  const photo = run.photoUrls[0] ?? run.thumbnailUrl;
  const resolve = (url: string) => (url.startsWith('/') ? `${baseUrl}${url}` : url);
  const stickers = useMemo(() => posterStickers(run, Date.now()), [run]);
  const lineColor = routeColor ?? c.value;
  const [cheer, setCheer] = useState({ cheers: run.cheers ?? 0, cheered: run.cheered ?? false });
  const [sending, setSending] = useState(false);

  // 들어오기
  const card = useSharedValue(0);
  const media = useSharedValue(0);
  const km = useSharedValue(0);
  const meta = useSharedValue(0);
  const stick = [useSharedValue(0), useSharedValue(0)];
  useEffect(() => {
    if (reduced) {
      [card, media, km, meta, ...stick].forEach((v) => { v.value = withTiming(1, { duration: 150 }); });
      return;
    }
    card.value = withDelay(220, withTiming(1, { duration: 500, easing: ENTER_EASE }));
    media.value = withDelay(300, withTiming(1, { duration: 350 }));
    km.value = withDelay(420, withTiming(1, { duration: 600, easing: ENTER_EASE }));
    meta.value = withDelay(500, withTiming(1, { duration: 450, easing: ENTER_EASE }));
    stick.forEach((v, i) => { v.value = withDelay(560 + i * 70, withSpring(1, { damping: 9, stiffness: 180 })); });
    // 공유 값은 한 번 만든 뒤 바뀌지 않는다
  }, [reduced]);

  const close = () => {
    if (reduced) { onClose(); return; }
    card.value = withTiming(0, { duration: 240, easing: EXIT_EASE }, (done) => { if (done) runOnJS(onClose)(); });
  };

  const cardStyle = useAnimatedStyle(() => ({
    opacity: reduced ? card.value : 1,
    transform: [{ translateY: reduced ? 0 : (1 - card.value) * (POSTER_HEIGHT + bottom + 40) }],
  }));
  const mediaStyle = useAnimatedStyle(() => ({ opacity: media.value }));
  const kmStyle = useRise(km, 26);
  const metaStyle = useRise(meta, 6);
  const stickStyles = [
    useAnimatedStyle(() => ({ opacity: Math.min(1, stick[0].value * 2), transform: [{ scale: 0.6 + 0.4 * stick[0].value }, { rotate: '-5deg' }] })),
    useAnimatedStyle(() => ({ opacity: Math.min(1, stick[1].value * 2), transform: [{ scale: 0.6 + 0.4 * stick[1].value }, { rotate: '4deg' }] })),
  ];

  const toggleCheer = async () => {
    if (mine || sending) return;
    const before = cheer;
    const next = { cheers: before.cheers + (before.cheered ? -1 : 1), cheered: !before.cheered };
    setCheer(next);
    setSending(true);
    try {
      const res = await client.post<{ cheers: number; cheered: boolean }>(`/posts/run/${run._id}/cheer`);
      setCheer(res.data);
      onCheered?.(run._id, res.data.cheers, res.data.cheered);
    } catch {
      setCheer(before);
    } finally {
      setSending(false);
    }
  };

  const stickerColor = (kind: StickerKind) =>
    kind === 'dawn' ? { bg: c.fresh, fg: c.onSocial } : kind === 'new' ? { bg: c.point, fg: c.onPoint } : { bg: '#F2FAFF', fg: '#0B1016' };

  return (
    <Animated.View accessibilityLabel="러닝 포스터" style={[styles.shadow, { bottom }, cardStyle]}>
      <View style={styles.card}>
        <Pressable
          accessibilityRole={onDetailPress ? 'button' : undefined}
          accessibilityLabel="러닝 상세 열기"
          disabled={!onDetailPress}
          onPress={() => onDetailPress?.(run._id)}
        >
          <Animated.View style={[styles.media, mediaStyle]}>
            {photo ? (
              <>
                <Image source={{ uri: resolve(photo) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
                {route && route.length > 1 && (
                  <View style={styles.miniRoute}>
                    <Svg width={72} height={72}>
                      <Path d={pathD(fitToBox(route, 72, 72, 15))} stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                )}
              </>
            ) : (
              route && route.length > 1 && (
                <Svg width="100%" height={MEDIA_H} viewBox={`0 0 362 ${MEDIA_H}`} preserveAspectRatio="xMidYMid meet" style={StyleSheet.absoluteFill}>
                  <Path d={pathD(fitToBox(route, 362, MEDIA_H, 30))} stroke={lineColor} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              )
            )}
            {stickers.length > 0 && (
              <View style={styles.stickers} pointerEvents="none">
                {stickers.map((kind, i) => {
                  const col = stickerColor(kind);
                  return (
                    <Animated.View key={kind} style={[styles.sticker, { backgroundColor: col.bg }, stickStyles[i]]}>
                      <Text style={[styles.stickerText, { color: col.fg }]}>{STICKER_LABEL[kind]}</Text>
                    </Animated.View>
                  );
                })}
              </View>
            )}
            <Animated.View style={[styles.kmRow, kmStyle]} accessible accessibilityLabel={`거리 ${run.distanceKm.toFixed(2)} km`}>
              <Text style={[styles.km, { color: photo ? '#FFFFFF' : c.text }]}>{run.distanceKm.toFixed(2)}</Text>
              <Text style={[styles.kmUnit, { color: photo ? 'rgba(255,255,255,0.88)' : c.value }]}>KM</Text>
            </Animated.View>
          </Animated.View>
        </Pressable>

        <Animated.View style={[styles.metaRow, metaStyle]}>
          <Pressable
            accessibilityRole={onUserPress ? 'button' : undefined}
            accessibilityLabel={`${username} 프로필 보기`}
            disabled={!onUserPress}
            onPress={() => onUserPress?.(run.userId._id)}
            style={styles.avatar}
          >
            {avatar ? (
              <Image source={{ uri: resolve(avatar) }} style={StyleSheet.absoluteFill} />
            ) : (
              <Text style={styles.avatarLetter}>{(username[0] ?? '?').toUpperCase()}</Text>
            )}
          </Pressable>
          <View style={styles.titleCol}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.sub} numberOfLines={1}>{`${username} · ${formatDay(run.createdAt)} · ${formatClock(run.createdAt)}`}</Text>
          </View>
          {onDetailPress && (
            <Pressable accessibilityRole="button" accessibilityLabel="코스 보기" onPress={() => onDetailPress(run._id)} style={styles.courseBtn} hitSlop={4}>
              <ChevronIcon size={18} color={c.ink} />
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={styles.closeBtn} onPress={close}>
            <CloseIcon size={18} color={c.text2} />
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.stats, metaStyle]}>
          <View>
            <Text style={styles.statLabel}>TIME</Text>
            <Text style={styles.statValue}>{formatDuration(run.paceSecPerKm * run.distanceKm)}</Text>
          </View>
          <View>
            <Text style={styles.statLabel}>PACE</Text>
            <Text style={styles.statValue}>{formatRunPace(run.paceSecPerKm, run.distanceKm)}</Text>
          </View>
          <Pressable
            accessibilityRole={mine ? undefined : 'button'}
            accessibilityLabel={mine ? `응원 ${cheer.cheers}개` : cheer.cheered ? `응원 취소, 지금 ${cheer.cheers}개` : `응원하기, 지금 ${cheer.cheers}개`}
            accessibilityState={mine ? undefined : { selected: cheer.cheered }}
            disabled={mine}
            onPress={toggleCheer}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}
          >
            <Text style={styles.statLabel}>CHEER</Text>
            <View style={styles.cheerValue}>
              <HeartIcon size={14} color={c.hype} filled={cheer.cheered || mine} />
              <Text style={[styles.statValue, { color: c.hype }]}>{cheer.cheers}</Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  shadow: {
    position: 'absolute', left: 14, right: 14, height: POSTER_HEIGHT, borderRadius: 26,
    ...elevationStyle(c),
  },
  card: {
    flex: 1, borderRadius: 26, overflow: 'hidden',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
  },
  media: { height: MEDIA_H, overflow: 'hidden', backgroundColor: c.map.bg },
  miniRoute: { position: 'absolute', right: 12, top: 12, width: 72, height: 72, borderRadius: 16, backgroundColor: 'rgba(11,16,22,0.4)' },
  stickers: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', gap: 6 },
  sticker: {
    paddingVertical: 7, paddingHorizontal: 11, borderRadius: 99,
    shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  stickerText: { fontFamily: FONT.bold, fontSize: 11.5, lineHeight: 13 },
  // 거리: 기울인 콘덴스드 숫자를 사진 아래로 조금 잘리게(포스터)
  kmRow: { position: 'absolute', left: 14, bottom: -18, flexDirection: 'row', alignItems: 'baseline' },
  km: { fontFamily: FONT.numCondensedBold, fontSize: 98, lineHeight: 98, letterSpacing: -3.4, transform: [{ skewX: '-8deg' }] },
  kmUnit: { ...monoLabel(15, 0.08), marginLeft: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 6 },
  avatar: {
    width: 38, height: 38, borderRadius: 19, overflow: 'hidden', backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: FONT.bold, fontSize: 13, color: c.ink },
  titleCol: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20, color: c.text },
  sub: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 17, color: c.text2 },
  // 36 + hitSlop 4 → 누르는 영역 44
  courseBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent },
  closeBtn: { marginRight: -6, width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 18, paddingTop: 4, paddingRight: 14, paddingLeft: 62 },
  statLabel: { ...monoLabel(9.5, 0.1), lineHeight: 14, color: c.muted },
  statValue: { fontFamily: FONT.num, fontSize: 15, lineHeight: 18, color: c.text },
  cheerValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
