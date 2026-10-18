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
import { FONT } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';

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

function formatPace(sec: number) {
  if (!sec) return "--'--\"";
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

// 서버에 러닝 시간 필드가 없어 페이스 × 거리로 계산한다(PRD Q12)
function formatDuration(paceSecPerKm: number, distanceKm: number) {
  const total = Math.round(paceSecPerKm * distanceKm);
  if (!total) return '--:--';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekday}요일 · ${h < 12 ? '오전' : '오후'} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 확정 UI S10 러닝 상세(추가 화면 ②) + 404·실패 상태
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

      {/* 위쪽: 뒤로 · 작성자 · 신고·차단 메뉴(남의 러닝만, S13) */}
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <View style={styles.logo} pointerEvents="none">
          <Wordmark width={71} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={goBack} style={styles.iconBtn}>
          <BackIcon color={c.text} />
        </Pressable>
        {state === 'ready' && run && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/user/${run.userId._id}`)}
            style={styles.author}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>{(username[0] ?? '?').toUpperCase()}</Text>
            </View>
            <Text style={styles.authorName}>{username}</Text>
          </Pressable>
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
            <RouteMap coordinates={run.route.coordinates} fit="route" style={StyleSheet.absoluteFillObject} />
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.when}>{formatWhen(run.createdAt)}</Text>
            <Text style={styles.title}>{placeName ?? '러닝 기록'}</Text>
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>
                {run.distanceKm.toFixed(2)}
                <Text style={styles.statUnit}> KM</Text>
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Avg Pace</Text>
              <Text style={styles.statValue}>
                {formatPace(run.paceSecPerKm)}
                <Text style={styles.statUnit}> /KM</Text>
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Time</Text>
              <Text style={styles.statValue}>{formatDuration(run.paceSecPerKm, run.distanceKm)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabelPlain}>날짜</Text>
              <Text style={[styles.statValue, { fontSize: 20 }]}>{new Date(run.createdAt).toLocaleDateString('ko-KR')}</Text>
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
              <Text style={styles.statLabel}>코스 소개</Text>
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
  topBar: { paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56 },
  logo: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  author: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: FONT.semibold, fontSize: 14, color: c.text },
  authorName: { fontFamily: FONT.semibold, fontSize: 16, color: c.text },
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
  mapCard: { marginTop: 8, marginHorizontal: 16, height: 220, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
  titleBlock: { marginTop: 14, paddingHorizontal: 20, gap: 2 },
  when: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, color: c.text2 },
  title: { fontFamily: FONT.semibold, fontSize: 20, lineHeight: 28, color: c.text },
  stats: { marginTop: 14, paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    width: '48.5%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  statLabel: { fontFamily: FONT.semibold, fontSize: 12, lineHeight: 16, color: c.text2 },
  statLabelPlain: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  statValue: { fontFamily: FONT.num, fontSize: 26, lineHeight: 32, color: c.text, fontVariant: ['tabular-nums'] },
  statUnit: { fontFamily: FONT.num, fontSize: 14, color: c.text2 },
  photos: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  photo: { width: 160, height: 120, borderRadius: 14, backgroundColor: c.surface2 },
  intro: { marginTop: 18, paddingHorizontal: 20, gap: 4 },
  introText: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23, color: c.text },
});
