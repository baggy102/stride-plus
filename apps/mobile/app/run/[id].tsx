import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { isAxiosError } from 'axios';
import * as Location from 'expo-location';
import client, { BASE_URL } from '@/api/client';
import { RouteMap } from '@/components/RouteMap';
import { Wordmark } from '@/components/Wordmark';
import { SafetyMenu } from '@/components/SafetyMenu';
import { CARD_FULL, CARD_RADIUS, ExpandedCard, titleOf, type FeedRun } from '@/components/FeedCard';
import { useAuthStore } from '@/store/auth';
import { BackIcon, RouteIcon } from '@/components/icons';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';
import { formatDuration, formatRunPace } from '@/utils/pace';
import { MOTION, useReducedMotion } from '@/utils/motion';

interface RunDetail {
  _id: string;
  userId: { _id: string; username: string; profileImageUrl?: string };
  route: { type: 'LineString'; coordinates: [number, number][] };
  distanceKm: number;
  paceSecPerKm: number;
  photoUrls: string[];
  description?: string;
  createdAt: string;
}

type LoadState = 'loading' | 'ready' | 'notfound' | 'error';

const TOP_BAR = 60; // 위 여백 8 + 버튼 44 + 8
const OPEN_MS = 340;

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

// Frost S10 러닝 상세(2026-11-15 확정 시안 16차): 피드에서 누른 카드가 그대로 맨 위 → 수치 3칸 → 지도 카드 → 코스 소개.
// 피드 · 캘린더에서 열면 그 카드 자리(from)에서 올라오고, 닫을 때는 반대로 돌아간다(R4). 동작 줄이기면 짧은 페이드
export default function RunDetailScreen() {
  const { id, from, src } = useLocalSearchParams<{ id: string; from?: string; src?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduced = useReducedMotion();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [placeName, setPlaceName] = useState<string | null>(null);
  const me = useAuthStore((s) => s.user?._id);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const { data } = await client.get<RunDetail>(`/runs/${id}`);
      setRun(data);
      setState('ready');
    } catch (e) {
      setState(isAxiosError(e) && e.response?.status === 404 ? 'notfound' : 'error');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // 장소: 출발 지점의 동네 이름(역지오코딩). 실패하면 「—」
  useEffect(() => {
    const start = run?.route.coordinates[0];
    if (!start) return;
    Location.reverseGeocodeAsync({ longitude: start[0], latitude: start[1] })
      .then(([place]) => {
        const name = place?.district ?? place?.subregion ?? place?.city ?? place?.name;
        if (name) setPlaceName(name);
      })
      .catch(() => {});
  }, [run]);

  // 열고 닫는 전환. t = 0(누른 카드 자리) ~ 1(상세). 앞 절반에 바탕이 덮이고, 뒤 절반에 위 바 · 수치 · 지도가 올라온다
  const heroTop = insets.top + TOP_BAR;
  const fromY = from !== undefined ? Number(from) : NaN;
  const fromCard = Number.isFinite(fromY) && !reduced;
  const offset = fromCard ? fromY - heroTop : 0;
  const heroFades = !fromCard || src === 'row';
  const t = useSharedValue(0);
  // 카드 자리에서 열 때는 데이터를 받아 맨 위 카드를 그릴 수 있을 때 시작한다. 늦으면(300ms) 먼저 바탕 · 위 바를 덮어
  // 뒤로 버튼이 보이게 한다(투명 모달이라 그 전에는 앞 화면만 보이고 조작이 막힌다)
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 300);
    return () => clearTimeout(timer);
  }, []);
  const start = state !== 'loading' || waited || !fromCard;
  useEffect(() => {
    if (!start) return;
    t.value = withTiming(1, { duration: reduced ? MOTION.reduced : OPEN_MS, easing: Easing.out(Easing.cubic) });
  }, [start, reduced, t]);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/feed'));
  const close = () => {
    // 맨 위 카드가 누른 카드 자리로 정확히 돌아가도록 스크롤을 먼저 맨 위로
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    t.value = withTiming(0, { duration: reduced ? MOTION.reduced : OPEN_MS, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done) runOnJS(goBack)();
    });
  };

  const bgStyle = useAnimatedStyle(() => ({ opacity: clamp01(t.value / 0.5) }));
  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroFades ? clamp01(t.value / 0.5) : 1,
    transform: [{ translateY: (1 - t.value) * offset }],
  }));
  const restStyle = useAnimatedStyle(() => {
    const b = fromCard ? clamp01((t.value - 0.5) / 0.5) : t.value;
    return { opacity: b, transform: [{ translateY: fromCard ? (1 - b) * 48 : 0 }] };
  });

  const username = run?.userId.username || '알 수 없음';
  const cardW = screenW - 20;
  const feedRun: FeedRun | null = run ? { ...run, route: run.route.coordinates } : null;
  const hasPhoto = !!run?.photoUrls.length;
  const time = run && run.paceSecPerKm && run.distanceKm ? formatDuration(run.paceSecPerKm * run.distanceKm) : '--:--';
  // 코스 소개가 한 줄이면 위 한 줄(카드 이름)로 끝, 더 있으면 지도 아래에 전문
  const longIntro = !!run?.description && run.description.trim() !== titleOf(run);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }, bgStyle]} />

      {/* 위쪽: 바탕 위 뒤로 · 작성자 · 신고 · 차단 메뉴(남의 러닝만, S13). 작성자가 없을 때(로딩 · 404 · 실패)만 워드마크 */}
      <Animated.View style={[styles.top, { paddingTop: insets.top + 8 }, restStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={close} style={styles.iconBtn}>
          <BackIcon size={24} color={c.text} />
        </Pressable>
        {state === 'ready' && run ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/user/${run.userId._id}`)} style={styles.author}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>{(username[0] ?? '?').toUpperCase()}</Text>
            </View>
            <Text style={styles.authorName} numberOfLines={1}>{username}</Text>
          </Pressable>
        ) : (
          <View style={styles.author}>
            <View style={styles.logo} pointerEvents="none">
              <Wordmark width={71} />
            </View>
          </View>
        )}
        {state === 'ready' && run && run.userId._id !== me && (
          <SafetyMenu
            label="러닝 메뉴"
            targetType="run"
            targetId={run._id}
            author={{ id: run.userId._id, username }}
            // 차단한 사용자의 러닝은 더 볼 수 없다 — 피드로(피드는 포커스 시 다시 불러온다)
            onBlocked={() => router.replace('/(tabs)/feed')}
          />
        )}
      </Animated.View>

      {state === 'loading' && (
        <View accessibilityLabel="불러오는 중" style={styles.center}>
          <ActivityIndicator color={c.value} size="large" />
        </View>
      )}

      {state === 'notfound' && (
        <Animated.View style={[styles.center, restStyle]}>
          <View style={styles.stateIcon}>
            <RouteIcon color={c.text2} size={28} />
          </View>
          <Text style={styles.stateTitle}>러닝을 찾을 수 없습니다</Text>
          <Text style={styles.stateBody}>삭제되었거나 볼 수 없는 러닝이에요.</Text>
          <Pressable accessibilityRole="button" onPress={close} style={styles.stateBtnGhost}>
            <Text style={styles.stateBtnGhostText}>뒤로 가기</Text>
          </Pressable>
        </Animated.View>
      )}

      {state === 'error' && (
        <Animated.View style={[styles.center, restStyle]}>
          <Text style={styles.stateTitle}>불러오지 못했어요</Text>
          <Text style={styles.stateBody}>네트워크 연결을 확인해 주세요.</Text>
          <Pressable accessibilityRole="button" onPress={load} style={styles.stateBtn}>
            <Text style={styles.stateBtnText}>다시 시도</Text>
          </Pressable>
        </Animated.View>
      )}

      {state === 'ready' && run && feedRun && (
        <ScrollView ref={scrollRef} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 34 }]} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.hero, heroStyle]}>
            <ExpandedCard run={feedRun} baseUrl={BASE_URL} liveMap pager mini={false} width={cardW} />
          </Animated.View>

          <Animated.View style={[styles.rest, restStyle]}>
            <View accessibilityLabel="러닝 기록" style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>시간</Text>
                <Text style={styles.statValue}>{time}</Text>
              </View>
              <View style={[styles.stat, styles.statWide, styles.statDivider]}>
                <Text style={styles.statLabel}>페이스</Text>
                <Text style={styles.statValue}>
                  {formatRunPace(run.paceSecPerKm, run.distanceKm)}
                  <Text style={styles.statUnit}>/km</Text>
                </Text>
              </View>
              <View style={[styles.stat, styles.statDivider]}>
                <Text style={styles.statLabel}>장소</Text>
                <Text style={styles.statText} numberOfLines={1}>{placeName ?? '—'}</Text>
              </View>
            </View>

            {/* 사진이 있는 기록만 아래에 지도 카드(사진이 없으면 맨 위가 지도) */}
            {hasPhoto && (
              <View style={styles.mapCard}>
                <RouteMap coordinates={run.route.coordinates} fit="route" kmTicks style={StyleSheet.absoluteFill} />
              </View>
            )}

            {longIntro && (
              <View accessibilityLabel="코스 소개" style={styles.intro}>
                <Text style={styles.introLabel}>코스 소개</Text>
                <Text style={styles.introText}>{run.description}</Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: 6, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  author: { flex: 1, minWidth: 0, height: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: FONT.semibold, fontSize: 14, color: c.ink },
  authorName: { flexShrink: 1, fontFamily: FONT.semibold, fontSize: 16, color: c.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  stateIcon: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  stateTitle: { marginTop: 8, fontFamily: FONT.semibold, fontSize: 20, lineHeight: 28, color: c.text, textAlign: 'center' },
  stateBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2, textAlign: 'center' },
  stateBtn: { marginTop: 16, width: 200, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  stateBtnText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
  stateBtnGhost: {
    marginTop: 16, width: 200, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  stateBtnGhostText: { fontFamily: FONT.semibold, fontSize: 16, color: c.text },
  body: { paddingHorizontal: 10, gap: 10 },
  hero: { height: CARD_FULL, borderRadius: CARD_RADIUS, overflow: 'hidden', backgroundColor: c.surface },
  rest: { gap: 10 },
  stats: { flexDirection: 'row', paddingVertical: 16, borderRadius: 22, backgroundColor: c.surface },
  stat: { flex: 1, minWidth: 0, paddingHorizontal: 16, gap: 6 },
  statWide: { flex: 1.2 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: c.border },
  statLabel: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  statValue: { fontFamily: FONT.num, fontSize: 22, lineHeight: 26, color: c.text, fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 12, color: c.text2 },
  statText: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 26, color: c.text },
  mapCard: { height: 224, borderRadius: 22, overflow: 'hidden', backgroundColor: c.map.bg },
  intro: { marginTop: 8, paddingHorizontal: 10, gap: 4 },
  introLabel: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  introText: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23, color: c.text },
});
