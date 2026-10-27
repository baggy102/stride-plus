import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isAxiosError } from 'axios';
import * as Location from 'expo-location';
import client, { BASE_URL } from '@/api/client';
import { RouteMap } from '@/components/RouteMap';
import { Wordmark } from '@/components/Wordmark';
import { SafetyMenu } from '@/components/SafetyMenu';
import { useAuthStore } from '@/store/auth';
import { BackIcon, RouteIcon } from '@/components/icons';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import { Glass } from '@/components/Glass';
import type { Palette } from '@/theme/colors';
import { formatDuration, formatPace } from '@/utils/pace';
import { formatClock, formatDay } from '@/utils/date';

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

// Frost S10 러닝 상세 — 유리 상단 바, 지도(+1 km 눈금), 거리 64px · Pace·Time·날짜, 사진, 코스 소개 + 404·실패 상태
export default function RunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
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

  // 제목: 출발 지점의 동네 이름(서버에 코스 이름 필드가 없다). 실패하면 「러닝 기록」
  useEffect(() => {
    const start = run?.route.coordinates[0];
    if (!start) return;
    Location.reverseGeocodeAsync({ longitude: start[0], latitude: start[1] })
      .then(([place]) => {
        const name = [place?.district, place?.street ?? place?.name].filter(Boolean).join(' ');
        if (name) setPlaceName(name);
      })
      .catch(() => {});
  }, [run]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/feed'));
  const username = run?.userId.username || '알 수 없음';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 위쪽: 유리 바(뒤로 · 작성자 · 신고·차단 메뉴(남의 러닝만, S13)), 가운데 워드마크 */}
      <View style={[styles.topWrap, { paddingTop: insets.top + 4 }]}>
        <Glass style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={goBack} style={styles.iconBtn}>
            <BackIcon size={24} color={c.text} />
          </Pressable>
          {state === 'ready' && run ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/user/${run.userId._id}`)}
              style={styles.author}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarLetter}>{(username[0] ?? '?').toUpperCase()}</Text>
              </View>
              <Text style={styles.authorName} numberOfLines={1}>{username}</Text>
            </Pressable>
          ) : (
            <View style={styles.author} />
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
          {/* 작성자 이름과 겹치지 않게 워드마크는 작성자가 없을 때(로딩·404·실패)만 */}
          {!(state === 'ready' && run) && (
            <View style={styles.logo} pointerEvents="none">
              <Wordmark width={71} />
            </View>
          )}
        </Glass>
      </View>

      {state === 'loading' && (
        <View accessibilityLabel="불러오는 중" style={styles.center}>
          <ActivityIndicator color={c.value} size="large" />
        </View>
      )}

      {state === 'notfound' && (
        <View style={styles.center}>
          <View style={styles.stateIcon}>
            <RouteIcon color={c.text2} size={28} />
          </View>
          <Text style={styles.stateTitle}>러닝을 찾을 수 없습니다</Text>
          <Text style={styles.stateBody}>삭제되었거나 볼 수 없는 러닝이에요.</Text>
          <Pressable accessibilityRole="button" onPress={goBack} style={styles.stateBtnGhost}>
            <Text style={styles.stateBtnGhostText}>뒤로 가기</Text>
          </Pressable>
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.stateTitle}>불러오지 못했어요</Text>
          <Text style={styles.stateBody}>네트워크 연결을 확인해 주세요.</Text>
          <Pressable accessibilityRole="button" onPress={load} style={styles.stateBtn}>
            <Text style={styles.stateBtnText}>다시 시도</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && run && (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={styles.mapCard}>
            <RouteMap coordinates={run.route.coordinates} fit="route" kmTicks style={StyleSheet.absoluteFill} />
          </View>

          <Text accessibilityRole="header" style={styles.title}>{placeName ?? '러닝 기록'}</Text>

          <View accessibilityLabel="러닝 기록" style={styles.record}>
            <View accessible accessibilityLabel={`거리 ${run.distanceKm.toFixed(2)} km`} style={styles.distanceRow}>
              <Text style={styles.distance}>{run.distanceKm.toFixed(2)}</Text>
              <Text style={styles.distanceUnit}>KM</Text>
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>PACE</Text>
                <Text style={styles.statValue}>
                  {formatPace(run.paceSecPerKm)}
                  <Text style={styles.statUnit}> /KM</Text>
                </Text>
              </View>
              <View style={[styles.stat, styles.statDivider]}>
                <Text style={styles.statLabel}>TIME</Text>
                <Text style={styles.statValue}>{run.paceSecPerKm && run.distanceKm ? formatDuration(run.paceSecPerKm * run.distanceKm) : '--:--'}</Text>
              </View>
              <View style={[styles.stat, styles.statWide, styles.statDivider]}>
                <Text style={styles.statLabelPlain}>날짜</Text>
                <Text style={styles.dateValue} numberOfLines={1}>
                  {formatDay(run.createdAt)}
                  <Text style={styles.dateClock}>{`  ${formatClock(run.createdAt)}`}</Text>
                </Text>
              </View>
            </View>
          </View>

          {run.photoUrls.length > 0 && (
            <ScrollView
              horizontal
              accessibilityLabel={`사진 ${run.photoUrls.length}장`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photos}
            >
              {run.photoUrls.map((url) => (
                <Image key={url} source={{ uri: `${BASE_URL}${url}` }} style={styles.photo} />
              ))}
            </ScrollView>
          )}

          {!!run.description && (
            <View accessibilityLabel="코스 소개" style={styles.intro}>
              <Text style={styles.introLabel}>코스 소개</Text>
              <Text style={styles.introText}>{run.description}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  topWrap: { paddingHorizontal: 12, paddingBottom: 8 },
  topBar: { height: 48, paddingHorizontal: 2, borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 4 },
  logo: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  author: { flex: 1, minWidth: 0, height: 44, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: FONT.semibold, fontSize: 14, color: c.text },
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
  mapCard: { marginTop: 4, marginHorizontal: 16, height: 220, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
  title: { marginTop: 12, paddingHorizontal: 20, fontFamily: FONT.semibold, fontSize: 20, lineHeight: 28, color: c.text },
  record: { marginTop: 2, paddingHorizontal: 20 },
  distanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  distance: { fontFamily: FONT.num, fontSize: 64, lineHeight: 68, letterSpacing: -1.3, color: c.text, fontVariant: ['tabular-nums'] },
  // 팔레트 토큰 이름이 value라 인라인 { color: c.value }는 reanimated 플러그인이 shared value로 오인해 경고한다 → StyleSheet로
  distanceUnit: { marginTop: 10, ...monoLabel(13), color: c.value },
  stats: { marginTop: 6, flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hair },
  stat: { flex: 1, paddingVertical: 8 },
  statWide: { flex: 1.25 },
  statDivider: { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: c.hair },
  statLabel: { ...monoLabel(11), lineHeight: 16, color: c.text2 },
  statLabelPlain: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  statValue: { fontFamily: FONT.num, fontSize: 22, lineHeight: 28, color: c.text, fontVariant: ['tabular-nums'] },
  statUnit: { ...monoLabel(11, 0.08), color: c.text2 },
  dateValue: { ...monoLabel(17, 0.02), lineHeight: 28, color: c.text },
  dateClock: { ...monoLabel(12, 0.04), color: c.text2 },
  photos: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  photo: { width: 160, height: 120, borderRadius: 14, backgroundColor: c.surface2 },
  intro: { marginTop: 18, paddingHorizontal: 20, gap: 4 },
  introLabel: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  introText: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23, color: c.text },
});
