import { useEffect, useMemo, useRef } from 'react';
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
import { useCheer } from '../useCheer';
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
  /** 경로(받았으면): 사진이 없을 때 크게 그린다 */
  route?: LngLat[];
  /** 값이 바뀌면 ×를 누른 것처럼 닫는다(카드 밖 빈 지도 탭) */
  dismissKey?: number;
  /** 지도 피드 NEW에서 연 카드: 이 러닝이 연 「이번 주 새 길」(km). 있으면 기록 아래 한 줄 */
  newKm?: number;
  /** 경로 색(지도 위 경로와 같게). 없으면 value */
  routeColor?: string;
  /** 내 러닝이면 응원 버튼 대신 받은 수만 */
  mine?: boolean;
  onCheered?: (runId: string, cheers: number, cheered: boolean) => void;
}

/** 카드 높이: 사진 136 + 기록 70 + 사람 44 + 행동 38 (A안, 2026-11-21) */
export const POSTER_HEIGHT = 288;
const MEDIA_H = 136;
const NEW_LINE_H = 20;
const ENTER_EASE = Easing.bezier(0.16, 1, 0.3, 1);
const EXIT_EASE = Easing.bezier(0.7, 0, 0.84, 0);

const pathD = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

// 투명도 + 아래에서 lift px. 들어올 때만 쓴다
function useRise(v: SharedValue<number>, lift: number) {
  return useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * lift }] }));
}

/**
 * 고른 러닝의 포스터 카드(2026-11-19 확정, 지도 피드 프로토타입 v8 개선안). 지도 피드·내 피드 공용, WebView 밖 네이티브.
 * 사진(없으면 경로, 위에는 스티커 · 닫기만) / 기록 한 묶음(거리 + TIME · PACE) / 사람 / 응원 · 코스 보기 (A안, 2026-11-21).
 * 들어올 때: 카드 0.22초 뒤 올라옴 → 사진 → 거리 → 스티커 → 글자. 닫을 때 0.24초에 내려간다
 */
export function MapPopupCard({ run, baseUrl, onClose, onUserPress, onDetailPress, bottom = 24, route, routeColor, mine = false, onCheered, dismissKey = 0, newKm }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduced = useReducedMotion();
  const username = run.userId.username || '알 수 없음';
  // 코스 이름 = 코스 소개 첫 줄(쓴 경우만). 있으면 굵은 첫 줄, 작성자 줄은 둘째 줄로(Q6, 2026-11-22)
  const courseName = run.description?.trim().split('\n')[0].trim();
  const byline = `${username} · ${formatDay(run.createdAt)} · ${formatClock(run.createdAt)}`;
  const avatar = run.userId.profileImageUrl;
  const photo = run.photoUrls[0] ?? run.thumbnailUrl;
  const resolve = (url: string) => (url.startsWith('/') ? `${baseUrl}${url}` : url);
  const stickers = useMemo(() => posterStickers(run, Date.now()), [run]);
  const lineColor = routeColor ?? c.value;
  // NEW 한 줄이 들어가면 사진을 그만큼 줄여 카드 높이(288)를 지킨다. 0.2 km 미만은 숫자 없이
  const newLine = newKm === undefined ? null : newKm >= 0.2 ? `이번 주 새 길 ${newKm.toFixed(1)} km` : '이번 주 새 길';
  const mediaH = newLine ? MEDIA_H - NEW_LINE_H : MEDIA_H;
  const { cheer, toggle: toggleCheer } = useCheer(run._id, { cheers: run.cheers ?? 0, cheered: run.cheered ?? false }, {
    disabled: mine,
    onCheered: (next) => onCheered?.(run._id, next.cheers, next.cheered),
  });

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

  // 카드 밖 빈 지도 탭: 카드가 열린 뒤 부모가 dismissKey를 바꾸면 ×와 같이 닫는다(열릴 때의 값은 무시)
  const openedKey = useRef(dismissKey);
  useEffect(() => {
    if (dismissKey !== openedKey.current) close();
    // close는 매 렌더 새로 만들어지지만 dismissKey가 바뀔 때만 부른다
  }, [dismissKey]);

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

  // 스티커 색은 러너 링 색 토큰(SPEC_v2 A). 코드 키 new는 토큰 today
  const stickerColor = (kind: StickerKind) => c.sticker[kind === 'new' ? 'today' : kind];

  return (
    <Animated.View accessibilityLabel="러닝 카드" style={[styles.shadow, { bottom }, cardStyle]}>
      <View style={styles.card}>
        <Pressable
          accessibilityRole={onDetailPress ? 'button' : undefined}
          accessibilityLabel="코스 보기"
          disabled={!onDetailPress}
          onPress={() => onDetailPress?.(run._id)}
        >
          <Animated.View style={[styles.media, { height: mediaH }, mediaStyle]}>
            {photo ? (
              <>
                <Image source={{ uri: resolve(photo) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
              </>
            ) : (
              route && route.length > 1 && (
                <Svg width="100%" height={mediaH} viewBox={`0 0 362 ${mediaH}`} preserveAspectRatio="xMidYMid meet" style={StyleSheet.absoluteFill}>
                  <Path d={pathD(fitToBox(route, 362, mediaH, 30))} stroke={lineColor} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
          </Animated.View>
        </Pressable>
        {/* 닫기: 카드 오른쪽 위(코스 보기와 겹치지 않게 미디어 바깥 형제) */}
        <Animated.View style={[styles.closeWrap, mediaStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={close}
            hitSlop={6}
            style={[styles.closeBtn, { backgroundColor: photo ? 'rgba(11,16,22,0.55)' : c.glass, borderColor: photo ? 'rgba(255,255,255,0.18)' : c.glassBorder }]}
          >
            <CloseIcon size={16} color={photo ? '#FFFFFF' : c.text2} />
          </Pressable>
        </Animated.View>

        {/* 기록 한 묶음: 거리(잘림 없음) + 오른쪽에 TIME · PACE */}
        <Animated.View style={[styles.recRow, kmStyle]}>
          <View style={styles.kmRow} accessible accessibilityLabel={`거리 ${run.distanceKm.toFixed(2)} km`}>
            <Text style={styles.km}>{run.distanceKm.toFixed(2)}</Text>
            <Text style={styles.kmUnit}>KM</Text>
          </View>
          <View style={styles.statsCol}>
            <View style={styles.statLine}>
              <Text style={styles.statValue}>{formatDuration(run.paceSecPerKm * run.distanceKm)}</Text>
              <Text style={styles.statLabel}>TIME</Text>
            </View>
            <View style={styles.statLine}>
              <Text style={styles.statValue}>{formatRunPace(run.paceSecPerKm, run.distanceKm)}</Text>
              <Text style={styles.statLabel}>PACE</Text>
            </View>
          </View>
        </Animated.View>

        {newLine && (
          <Animated.View style={[styles.newRow, metaStyle]}>
            <View style={[styles.newDot, { backgroundColor: c.fresh }]} />
            <Text style={[styles.newText, { color: c.fresh }]}>{newLine}</Text>
          </Animated.View>
        )}

        {/* 사람: 아바타 · 코스 이름(쓴 경우만) / 작성자 · 날짜 · 시각. 코스 이름이 없으면 작성자 줄이 첫 줄 */}
        <Animated.View style={[styles.personRow, metaStyle]}>
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
            <Text style={styles.title} numberOfLines={1}>{courseName || byline}</Text>
            {!!courseName && <Text style={styles.sub} numberOfLines={1}>{byline}</Text>}
          </View>
        </Animated.View>

        {/* 행동: 응원(왼쪽) · 코스 보기(오른쪽) */}
        <Animated.View style={[styles.actionRow, metaStyle]}>
          <Pressable
            accessibilityRole={mine ? undefined : 'button'}
            accessibilityLabel={mine ? `응원 ${cheer.cheers}개` : cheer.cheered ? `응원 취소, 지금 ${cheer.cheers}개` : `응원하기, 지금 ${cheer.cheers}개`}
            accessibilityState={mine ? undefined : { selected: cheer.cheered }}
            disabled={mine}
            onPress={toggleCheer}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 12 }}
            style={styles.cheerValue}
          >
            <HeartIcon size={15} color={c.hype} filled={cheer.cheered || mine} />
            <Text style={[styles.cheerCount, { color: c.hype }]}>{cheer.cheers}</Text>
            <Text style={styles.cheerLabel}>응원</Text>
          </Pressable>
          {onDetailPress && (
            <Pressable accessibilityRole="button" accessibilityLabel="코스 보기" onPress={() => onDetailPress(run._id)} style={styles.courseBtn} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
              <Text style={styles.courseText}>코스 보기</Text>
              <ChevronIcon size={14} color={c.text2} />
            </Pressable>
          )}
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
  media: { overflow: 'hidden', backgroundColor: c.map.bg },
  newRow: { height: NEW_LINE_H, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  newDot: { width: 7, height: 7, borderRadius: 4 },
  newText: { fontFamily: FONT.semibold, fontSize: 12.5, lineHeight: 16 },
  stickers: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', gap: 6 },
  sticker: {
    paddingVertical: 7, paddingHorizontal: 11, borderRadius: 99,
    shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  stickerText: { fontFamily: FONT.bold, fontSize: 11.5, lineHeight: 13 },
  // 높이 288 = 미디어 136 + 기록 70 + 사람 44 + 행동 38. 모든 글자는 왼쪽 16 한 기준선
  recRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, paddingTop: 10, paddingHorizontal: 16 },
  kmRow: { flexDirection: 'row', alignItems: 'baseline' },
  km: { fontFamily: FONT.numCondensedBold, fontSize: 56, lineHeight: 60, letterSpacing: -1.6, color: c.text, transform: [{ skewX: '-8deg' }] },
  kmUnit: { ...monoLabel(13, 0.08), marginLeft: 5, color: c.value },
  statsCol: { gap: 2, paddingBottom: 8 },
  statLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6, paddingHorizontal: 16 },
  avatar: {
    width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: FONT.bold, fontSize: 12, color: c.ink },
  titleCol: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONT.semibold, fontSize: 14, lineHeight: 18, color: c.text },
  sub: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingHorizontal: 16 },
  courseBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  courseText: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  // 보이는 원 32 + hitSlop 6 → 누르는 영역 44
  closeWrap: { position: 'absolute', top: 12, right: 12 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statLabel: { ...monoLabel(9.5, 0.1), lineHeight: 14, color: c.muted },
  statValue: { fontFamily: FONT.num, fontSize: 15, lineHeight: 18, color: c.text },
  cheerValue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cheerCount: { fontFamily: FONT.num, fontSize: 15, lineHeight: 18 },
  cheerLabel: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
});
