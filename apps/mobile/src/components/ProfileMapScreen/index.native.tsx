import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, Pressable, type LayoutChangeEvent } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as SecureStorage from '@/utils/secureStorage';
import client, { BASE_URL } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { Wordmark } from '@/components/Wordmark';
import { MapPopupCard, POSTER_HEIGHT } from '@/components/MapPopupCard';
import { routeFxScript, type RouteFxOptions } from '@/components/map/routeFx';
import { traceLayerScript, type TraceColors, type TraceMessage } from '@/components/map/traceLayer';
import { routeGeometry } from '@/utils/route';
import { evenPoints, firstRunFlags, FIRST_RUN_MIN_KM, mostFrequent } from '@/utils/shareRun';
import { ShareCard, type ShareCardData } from '@/components/ShareCard';
import { BackIcon, BlockedIcon, GearIcon, ListIcon, LocateIcon, MapIcon, ShareIcon } from '@/components/icons';
import { SafetyMenu } from '@/components/SafetyMenu';
import { useTabBarClearance } from '@/components/FloatingTabBar';
import { useColors, useScheme } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import { Glass } from '@/components/Glass';
import { fetchRunStats, type RunStats } from '@/api/stats';
import { elevationStyle, withAlpha, type Palette } from '@/theme/colors';
import { baseMapScript, leafletHead, markerIconsScript, MARKER_PULSE_CSS, useMapTheme, type WebViewHandle } from '@/components/map/mapHtml';
import Svg, { Circle } from 'react-native-svg';
import { RunList, type ListState, type RunWithRoute } from './RunList';
import { CalendarView } from './CalendarView';

interface UserProfile {
  _id: string;
  username: string;
  profileImageUrl?: string;
  /** 내가 차단한 사용자(C1) */
  blockedByMe?: boolean;
}

interface Props {
  userId?: string;
  /** 방금 저장한 러닝 — 목록 보기로 열고 히어로가 File 전환으로 들어온다 */
  filedRunId?: string;
}

type ProfileView = 'map' | 'list' | 'cal';

// 캘린더 보기 버튼 아이콘(도트 격자)
function CalendarDotsIcon({ color }: { color: string }) {
  const dots = [[6, 6.5, 1], [12, 6.5, 1], [18, 6.5, 0], [6, 12.5, 1], [12, 12.5, 0], [18, 12.5, 0], [6, 18.5, 0], [12, 18.5, 0], [18, 18.5, 0]];
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      {dots.map(([cx, cy, on]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2} fill={on ? color : 'none'} stroke={color} strokeWidth={on ? 0 : 1.8} />
      ))}
    </Svg>
  );
}

const PAGE_SIZE = 20;
// 고른 경로는 카메라가 먼저 움직이고 0.38초 뒤 그린다(지도 피드와 같다)
const ROUTE_DELAY_MS = 380;
// 실제 처리(서버 home-privacy: 남에게는 출발·도착 100m를 자른다)만 말한다. 「집」·「기본 ON」은 끄는 화면·법적 확인 전이라 쓰지 않음
const HOME_LABEL = '출발·도착 100m는 다른 사람에게 안 보여요';
// 저장 직후 「내 흔적」: 카메라가 새 경로로 간 뒤 스며들기 시작
const TRACE_DELAY_MS = 650;
const TOAST_MS = 2800;
// 응원 받은 순간: 마지막으로 본 시각(ISO)
const CHEER_SEEN_KEY = 'cheerSeenAt';

function traceColors(c: Palette): TraceColors {
  return { base: c.muted, ice: c.map.dot, mint: c.fresh };
}

// 테마가 바뀔 때만 새로 만든다. 러닝은 window.__setRuns로 넣는다(D2 — 재로드 없음)
function buildHtml(p: Palette, dark: boolean) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  ${leafletHead({ cluster: true })}
  <style>
    * { margin:0; padding:0; }
    #map { width:100vw; height:100vh; }
    .leaflet-popup-content-wrapper {
      background: ${p.surface} !important;
      border: 1px solid ${p.border} !important;
      border-radius: 12px !important;
      box-shadow: 0 4px 24px ${withAlpha(p.shadow, 0.7)} !important;
      color: ${p.text} !important;
    }
    .leaflet-popup-tip { background: ${p.surface} !important; }
${MARKER_PULSE_CSS}
  </style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true }).setView([37.5665, 126.978], 13);
${baseMapScript(p, dark)}
${markerIconsScript(p, 'profile')}
${routeFxScript()}
${traceLayerScript()}
  var group = L.markerClusterGroup({ iconCreateFunction: clusterIcon, showCoverageOnHover: false, maxClusterRadius: 60 });
  map.addLayer(group);
  // 빈 지도 탭 → 열린 카드를 닫는다(마커 click은 지도로 버블링되지 않고, 끌기·핀치는 click이 아니다)
  map.on('click', function() { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapTap' })); });
  var fitted = false;

  // 응원 받은 순간: 응원 받은 내 길이 한 번 빛났다 사라진다(약 2초, 동작 줄이기면 짧게 한 번)
  window.__glow = function(routes, color) {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    routes.forEach(function(route) {
      if (!route || route.length < 2) return;
      var line = L.polyline(route.map(function(p) { return [p[1], p[0]]; }), { color: color, weight: 7, opacity: 0, interactive: false, lineCap: 'round' }).addTo(map);
      var t0 = performance.now(), dur = reduce ? 700 : 2000;
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur), o = k < 0.3 ? k / 0.3 : (1 - k) / 0.7;
        line.setStyle({ opacity: 0.9 * o });
        if (k < 1) requestAnimationFrame(step); else map.removeLayer(line);
      })(t0);
    });
  };

  // 처음 받은 러닝에만 화면을 맞춘다(새로고침·다음 페이지로 다시 들어와도 보던 위치 유지)
  var lastRuns = [];
  window.__onTheme = function(c) {
    makeIcons(c);
    window.__setRuns(lastRuns);
  };

  window.__setRuns = function(runs) {
    lastRuns = runs;
    // 내 흔적: 러닝이 지난 칸(D3 격자)
    window.__trace.setRuns(runs.map(function(r) { return { _id: r._id, t: Date.parse(r.createdAt) || 0, route: r.route || [] }; }));
    group.clearLayers();
    var all = [];
    runs.forEach(function(run) {
      if (!run.startPoint) return;
      var latLng = [run.startPoint[1], run.startPoint[0]];
      all.push(latLng);
      var marker = L.marker(latLng, { icon: glassDotIcon });
      marker.on('click', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify(run));
      });
      group.addLayer(marker);
    });
    if (fitted) return;
    fitted = true;
    if (all.length > 1) map.fitBounds(all, { padding: [40, 40] });
    else if (all.length === 1) map.setView(all[0], 14);
  };
</script>
</body>
</html>`;
}

// 확정 UI S08 내 프로필 / S09 다른 사용자 프로필 — 지도·목록 전환
export function ProfileMapScreen({ userId, filedRunId }: Props) {
  const c = useColors();
  const dark = useScheme() === 'dark';
  const styles = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const targetId = userId ?? user?._id;
  const mine = !userId || userId === user?._id;
  // 내 프로필 탭(userId 없음)은 플로팅 탭바 위로 올린다. user/[id]는 탭바가 없다
  const tabClearance = useTabBarClearance();
  const bottomBase = userId ? insets.bottom + 24 : tabClearance + 12;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [listState, setListState] = useState<ListState>('loading');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<ProfileView>('map');
  const [selected, setSelected] = useState<RunWithRoute | null>(null);
  // 빈 지도 탭 횟수: 열린 카드는 이 값이 바뀌면 닫힌다(새 카드는 열릴 때의 값을 기준으로 삼는다)
  const [dismissKey, setDismissKey] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerHeightRef = useRef(0);
  headerHeightRef.current = headerHeight;
  const [toast, setToast] = useState<{ title: string; sub: string } | null>(null);
  // 저장 직후 공유: 재생한 러닝 → 공유 버튼(시간으로 사라지지 않음) → 공유 이미지 캡처 → 공유 시트
  const playedRef = useRef<string | null>(null);
  const [shareRunId, setShareRunId] = useState<string | null>(null);
  const [shareData, setShareData] = useState<ShareCardData | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<ComponentRef<typeof View>>(null);
  // 응원 받은 순간: 화면이 열릴 때마다 한 번, 마지막으로 본 뒤 받은 응원이 있으면 그 길이 빛나고 토스트
  const cheerCheckPending = useRef(true);
  const webViewRef = useRef<WebViewHandle>(null);
  const mapLoaded = useRef(false);
  // HTML은 처음 테마로 한 번만 — 테마 전환은 __setTheme 주입(D3)
  const { initial: initialTheme, applyTheme } = useMapTheme(webViewRef, c, dark);
  const html = useMemo(() => buildHtml(initialTheme.p, initialTheme.dark), [initialTheme]);

  // 지도에 러닝을 넣는다 — WebView를 다시 로드하지 않는다
  const pendingTrace = useRef<string | null>(null);
  const pushRuns = useCallback(() => {
    if (!mapLoaded.current) return;
    webViewRef.current?.injectJavaScript(`window.__setRuns(${JSON.stringify(runs)});true;`);
    const filed = runs.find((run) => run._id === pendingTrace.current);
    if (!filed) return;
    pendingTrace.current = null;
    playedRef.current = filed._id;
    const pad = [headerHeightRef.current + 16, bottomBase + 96];
    webViewRef.current?.injectJavaScript(
      `window.__fitRoute(${JSON.stringify(filed.route)},${JSON.stringify(pad)});setTimeout(function(){window.__trace.play(${JSON.stringify(filed._id)});},${TRACE_DELAY_MS});true;`,
    );
  }, [runs, bottomBase]);

  useEffect(pushRuns, [pushRuns]);

  const fetchPage = useCallback(
    (nextPage: number) => client.get<RunWithRoute[]>(`/runs?userId=${targetId}&page=${nextPage}&limit=${PAGE_SIZE}`),
    [targetId],
  );

  // 첫 페이지와 프로필을 다시 불러온다. refresh = 당겨서 새로고침(스피너), quiet = 탭 재진입 · 저장 직후(스피너 없이).
  // 매거진 피드에서 RefreshControl을 코드로 켜면 iOS가 스크롤 위치를 밀어 카드 스냅이 어긋나서 나눈다
  const load = useCallback(async (mode: 'initial' | 'refresh' | 'quiet') => {
    if (!targetId) return;
    if (mode === 'initial') setListState('loading');
    else if (mode === 'refresh') setRefreshing(true);
    try {
      const [profileRes, runsRes, statsRes] = await Promise.all([
        client.get<UserProfile>(`/users/${targetId}`),
        fetchPage(1),
        // 누적이 실패해도 목록은 보여 준다
        fetchRunStats(targetId).catch(() => null),
      ]);
      setProfile(profileRes.data);
      setStats(statsRes);
      setRuns(runsRes.data);
      setPage(1);
      setHasMore(runsRes.data.length === PAGE_SIZE);
      setListState('ready');
    } catch {
      if (mode === 'initial') setListState('error');
    } finally {
      setRefreshing(false);
    }
  }, [targetId, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || refreshing || listState !== 'ready') return;
    setLoadingMore(true);
    try {
      const { data } = await fetchPage(page + 1);
      setRuns((prev) => [...prev, ...data]);
      setPage(page + 1);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // 다음 페이지 실패는 목록을 유지하고 다음 스크롤에서 다시 시도한다
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, refreshing, listState, fetchPage, page]);

  // targetId가 hydration 후 처음 생길 때 fetch (SecureStore 비동기 타이밍 대응)
  useEffect(() => {
    load('initial');
  }, [load]);

  // 저장 직후: 지도 보기로 바꾸고 새 기록을 불러온 뒤, 그 경로가 내 흔적(칸)으로 스며든다(2026-11-19 내 피드 A안).
  // 파라미터는 지우고 재생할 러닝 ID만 남긴다(pushRuns가 재생한다)
  useEffect(() => {
    if (!filedRunId) return;
    pendingTrace.current = filedRunId;
    setView('map');
    setSelected(null);
    load('quiet');
    router.setParams({ filed: undefined });
  }, [filedRunId]);

  // 내 흔적 결과 알림(잠깐 떴다 사라진다)
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // 칸 색은 테마를 따른다
  useEffect(() => {
    if (!mapLoaded.current) return;
    webViewRef.current?.injectJavaScript(`window.__trace.setColors(${JSON.stringify(traceColors(c))});true;`);
  }, [c]);

  // 고른 러닝: 카메라를 경로에 맞추고 경로 연출 A+(지도 피드와 같다). 남의 러닝은 서버가 집 근처를 잘라 보낸다
  const drawnId = useRef<string | null>(null);
  useEffect(() => {
    if (!mapLoaded.current) return;
    if (!selected) {
      drawnId.current = null;
      webViewRef.current?.injectJavaScript('window.__routeFx&&window.__routeFx.clear();true;');
      return;
    }
    const geometry = routeGeometry(selected.route, mine);
    const options: RouteFxOptions = {
      col: c.map.dot, bg: c.bg, glass: c.glass, glassBorder: c.glassBorder, text: c.text, text2: c.text2,
      label: mine ? HOME_LABEL : null,
      delay: ROUTE_DELAY_MS,
      keep: drawnId.current === selected._id,
      seed: selected._id.length,
    };
    const first = drawnId.current !== selected._id;
    drawnId.current = selected._id;
    const pad = [headerHeightRef.current + 16, bottomBase + POSTER_HEIGHT + 24];
    webViewRef.current?.injectJavaScript(
      `${first ? `window.__fitRoute(${JSON.stringify(selected.route)},${JSON.stringify(pad)});` : ''}window.__routeFx.show(${JSON.stringify(geometry)},${JSON.stringify(options)});true;`,
    );
  }, [selected, mine, c, bottomBase]);

  // 탭 재진입 시 화면을 유지한 채 다시 불러온다. 다른 탭으로 가면 저장 직후 공유 버튼은 사라진다
  const skipFirstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) skipFirstFocus.current = false;
    else load('quiet');
    cheerCheckPending.current = true;
    return () => setShareRunId(null);
  }, [load]));

  // 마지막으로 본 시각(기기 저장) 이후 받은 응원. 처음이면 지금을 기록만 한다(쌓인 응원이 한꺼번에 뜨지 않게).
  // 저장 직후 재생 중이면 그 알림을 우선하고 이번엔 건너뛴다
  const checkCheers = useCallback(async () => {
    if (!mine || !mapLoaded.current || listState !== 'ready' || !cheerCheckPending.current) return;
    cheerCheckPending.current = false;
    if (pendingTrace.current || playedRef.current) return;
    try {
      const seen = await SecureStorage.getItem(CHEER_SEEN_KEY);
      const now = new Date().toISOString();
      if (!seen) { await SecureStorage.setItem(CHEER_SEEN_KEY, now); return; }
      const { data } = await client.get<{ runId: string; count: number }[]>(`/posts/cheers/received?since=${encodeURIComponent(seen)}`);
      await SecureStorage.setItem(CHEER_SEEN_KEY, now);
      const total = data.reduce((sum, r) => sum + r.count, 0);
      if (total === 0) return;
      const ids = new Set(data.map((r) => r.runId));
      const routes = runs.filter((r) => ids.has(r._id)).map((r) => r.route);
      webViewRef.current?.injectJavaScript(`window.__glow(${JSON.stringify(routes)},${JSON.stringify(c.fresh)});true;`);
      setToast({ title: `지난번 길에 응원이 ${total}개 왔어요`, sub: '내 흔적' });
    } catch {
      // 못 받으면 다음에 다시 본다(본 시각을 바꾸지 않음)
    }
  }, [mine, listState, runs, c.fresh]);
  useEffect(() => { checkCheers(); }, [checkCheers]);

  // 공유 이미지 재료: 출발·도착 100m를 자른 경로, 불러 둔 내 이전 러닝에 없던 구간, 경로 위 다섯 점 중 가장 많이 나온 동
  const startShare = useCallback(async () => {
    const run = runs.find((r) => r._id === shareRunId);
    if (!run || sharing) return;
    setSharing(true);
    try {
      const main = routeGeometry(run.route, true).main;
      const created = Date.parse(run.createdAt);
      const previous = runs.filter((r) => r._id !== run._id && Date.parse(r.createdAt) < created).map((r) => r.route);
      const { first, km } = firstRunFlags(main, previous);
      const names = await Promise.all(evenPoints(main, 5).map(async ([lng, lat]) => {
        try {
          const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          return place?.district ?? null;
        } catch {
          return null;
        }
      }));
      setShareData({
        route: main, first, firstKm: km >= FIRST_RUN_MIN_KM ? km : 0, place: mostFrequent(names),
        distanceKm: run.distanceKm, paceSecPerKm: run.paceSecPerKm, createdAt: run.createdAt,
      });
    } catch {
      setSharing(false);
    }
  }, [runs, shareRunId, sharing]);

  // 화면 밖에 그린 공유 이미지를 다음 프레임에 캡처해 공유 시트로. 공유를 마치면(취소 포함) 버튼도 사라진다
  useEffect(() => {
    if (!shareData) return;
    const frame = requestAnimationFrame(async () => {
      try {
        const uri = await captureRef(shareRef, { format: 'png', width: 1080, height: 1920, result: 'tmpfile' });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
        setShareRunId(null);
      } catch {
        // 캡처·공유 실패: 버튼은 남겨 두고 다시 누를 수 있게 한다
      } finally {
        setShareData(null);
        setSharing(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [shareData]);

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webViewRef.current?.injectJavaScript(`map.flyTo([${latitude}, ${longitude}], Math.max(map.getZoom(), 13)); true;`);
    } catch {}
  }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/feed'));
  // top = 누른 카드의 화면 y — 상세가 그 자리에서 열린다(R4). 지도 팝업은 기본 전환
  // src = row: 캘린더 한 줄 카드에서 열림(맨 위 카드가 겹쳐 나타난다)
  const openRun = (runId: string, top?: number, src?: 'row') =>
    router.push({ pathname: '/run/[id]', params: top === undefined ? { id: runId } : { id: runId, from: String(Math.round(top)), ...(src ? { src } : {}) } });

  // 누적은 서버 합계(D3). 실패하면 불러온 목록 합으로 대신하고 개수에 + 를 붙인다
  const totalKm = stats?.totalKm ?? runs.reduce((sum, run) => sum + run.distanceKm, 0);
  const runCount = stats ? String(stats.runCount) : `${runs.length}${hasMore ? '+' : ''}`;
  const displayName = profile?.username ?? (mine ? user?.username ?? '' : '');
  const avatarLetter = (displayName || '?')[0].toUpperCase();
  const blocked = !mine && !!profile?.blockedByMe;
  const showMap = view === 'map' && listState === 'ready' && !blocked;
  // 지도 WebView는 목록 보기 중에도 유지한다(전환 시 재로드 없음)
  const mapMounted = listState === 'ready' && !blocked;

  return (
    <View style={[styles.container, { backgroundColor: showMap ? c.map.bg : c.bg }]}>
      {blocked ? (
        // S09 차단 상태 — 프로필·러닝을 보여 주지 않는다
        <View style={styles.blocked}>
          <View style={styles.blockedIcon}>
            <BlockedIcon color={c.text2} />
          </View>
          <Text style={styles.blockedTitle}>차단한 사용자입니다</Text>
          <Text style={styles.blockedBody}>이 사용자의 프로필과 러닝을 볼 수 없어요.</Text>
          <Pressable accessibilityRole="button" onPress={goBack} style={styles.blockedBtn}>
            <Text style={styles.blockedBtnText}>뒤로 가기</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {mapMounted && (
            <WebView
              ref={webViewRef}
              source={{ html }}
              style={StyleSheet.absoluteFill}
              originWhitelist={['*']}
              onLoadStart={() => { mapLoaded.current = false; }}
              onLoadEnd={() => {
                mapLoaded.current = true;
                applyTheme();
                webViewRef.current?.injectJavaScript(`window.__trace.setColors(${JSON.stringify(traceColors(c))});true;`);
                pushRuns();
                checkCheers();
              }}
              onMessage={(e) => {
                try {
                  const message = JSON.parse(e.nativeEvent.data) as RunWithRoute | TraceMessage | { type: 'mapTap' };
                  if ('type' in message && message.type === 'mapTap') {
                    setDismissKey((k) => k + 1);
                    setShareRunId(null);
                  } else if ('type' in message && message.type === 'trace') {
                    if (playedRef.current) { setShareRunId(playedRef.current); playedRef.current = null; }
                    setToast(message.fresh > 0
                      ? { title: `새 길 ${message.fresh}칸을 열었어요`, sub: `내 흔적 +${message.total}칸` }
                      : { title: `익숙한 길 ${message.total}칸을 다시 달렸어요`, sub: '내 흔적' });
                  } else {
                    setSelected(message as RunWithRoute);
                  }
                } catch {}
              }}
            />
          )}
          {showMap && !selected && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="내 위치로 이동"
              style={[styles.myLocBtn, { bottom: bottomBase }]}
              onPress={handleMyLocation}
            >
              <Glass style={styles.myLocGlass}>
                <LocateIcon color={c.navOn} />
              </Glass>
            </Pressable>
          )}
          {showMap ? null : view === 'cal' && targetId ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
              <CalendarView
                userId={targetId}
                topInset={headerHeight}
                bottomInset={bottomBase}
                reloadKey={`${runs[0]?._id ?? ''}:${stats?.runCount ?? ''}`}
                onRunPress={(runId, top) => openRun(runId, top, 'row')}
              />
            </View>
          ) : view === 'map' && listState === 'loading' ? (
            <View accessibilityLabel="불러오는 중" style={styles.center}>
              <ActivityIndicator color={c.value} size="large" />
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
              <RunList
                runs={runs}
                state={listState}
                baseUrl={BASE_URL}
                mine={mine}
                refreshing={refreshing}
                loadingMore={loadingMore}
                topInset={headerHeight}
                bottomInset={bottomBase}
                onRefresh={() => load('refresh')}
                onEndReached={loadMore}
                onRetry={() => load('initial')}
                onRunPress={openRun}
                onStartRun={() => router.push('/(tabs)/record')}
              />
            </View>
          )}
        </>
      )}

      {/* 프로필 헤더 */}
      <View
        onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={[styles.header, { paddingTop: insets.top + 4 }, (blocked || !showMap) && styles.headerBlocked]}
      >
        <View style={styles.topRow}>
          <View style={styles.logo} pointerEvents="none">
            <Wordmark width={71} />
          </View>
          {userId ? (
            <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={goBack} style={[styles.iconBtn, styles.leftBtn]}>
              <BackIcon size={24} color={c.text} />
            </Pressable>
          ) : (
            // 내 프로필만 설정 진입(S11)
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="설정"
              onPress={() => router.push('/settings')}
              style={[styles.iconBtn, styles.rightBtn]}
            >
              <GearIcon color={c.text2} />
            </Pressable>
          )}
          {userId && !mine && !blocked && profile && (
            <View style={styles.rightMenu}>
              <SafetyMenu
                label="사용자 메뉴"
                targetType="user"
                targetId={profile._id}
                author={{ id: profile._id, username: profile.username }}
                onBlocked={() => { setSelected(null); setProfile({ ...profile, blockedByMe: true }); }}
              />
            </View>
          )}
        </View>

        {!blocked && (
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              {profile?.profileImageUrl ? (
                <Image source={{ uri: profile.profileImageUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              )}
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.username} numberOfLines={1}>{displayName}</Text>
              {listState === 'ready' ? (
                <Text style={styles.stats} accessibilityLabel={`누적 ${totalKm.toFixed(1)} km, ${runCount}회`}>
                  {'TOTAL '}
                  <Text style={styles.statsValue}>{totalKm.toFixed(1)}</Text>
                  {' km  ·  '}
                  <Text style={styles.statsValue}>{runCount}</Text>
                  {' RUNS'}
                </Text>
              ) : (
                <Text style={styles.stats}> </Text>
              )}
            </View>
            <View accessibilityRole="tablist" accessibilityLabel="기록 보기 방식" style={styles.segment}>
              {/* 보기 버튼 3개를 알약 하나로(2026-11-15 B안), 고른 칸만 포인트 색 */}
              {(['map', 'list', 'cal'] as const).map((id) => {
                const on = view === id;
                const color = on ? c.onPoint : c.text2;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={id === 'map' ? '지도 보기' : id === 'list' ? '목록 보기' : '캘린더 보기'}
                    hitSlop={{ top: 3, bottom: 3 }}
                    onPress={() => { setView(id); setSelected(null); }}
                    style={[styles.segmentBtn, on && styles.segmentOn]}
                  >
                    {id === 'map' ? <MapIcon color={color} /> : id === 'list' ? <ListIcon color={color} /> : <CalendarDotsIcon color={color} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* 선택된 런: 포스터 카드(지도 피드와 같다) */}
      {showMap && selected && (
        <MapPopupCard
          key={selected._id}
          run={selected}
          baseUrl={BASE_URL}
          bottom={bottomBase}
          route={selected.route}
          routeColor={c.map.dot}
          mine={mine}
          dismissKey={dismissKey}
          onClose={() => setSelected(null)}
          onDetailPress={openRun}
          onCheered={(runId, cheers, cheered) => setRuns((prev) => prev.map((run) => (run._id === runId ? { ...run, cheers, cheered } : run)))}
        />
      )}

      {/* 내 흔적 알림 */}
      {showMap && toast && !selected && (
        <View accessibilityRole="alert" style={[styles.toastShadow, { bottom: bottomBase + 60 }]} pointerEvents="none">
          <Glass style={styles.toast}>
            <Text style={styles.toastTitle}>{toast.title}</Text>
            <Text style={styles.toastSub}>{toast.sub}</Text>
          </Glass>
        </View>
      )}

      {/* 저장 직후 공유 버튼(토스트 아래). 빈 지도 탭 · 다른 탭 · 공유를 마치면 사라진다 */}
      {showMap && shareRunId && !selected && (
        <View style={[styles.shareShadow, { bottom: bottomBase + 4 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이번 러닝 공유"
            accessibilityState={{ busy: sharing }}
            disabled={sharing}
            onPress={startShare}
            style={styles.shareBtn}
          >
            {sharing ? <ActivityIndicator size="small" color={c.ink} /> : <ShareIcon size={16} color={c.ink} />}
            <Text style={styles.shareText}>공유</Text>
          </Pressable>
        </View>
      )}
      {/* 공유 이미지: 화면 밖에 그려 캡처만 한다 */}
      {shareData && (
        <View style={styles.offscreen} pointerEvents="none">
          <ShareCard ref={shareRef} data={shareData} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    backgroundColor: c.header,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  headerBlocked: { backgroundColor: c.bg, borderBottomColor: 'transparent' },
  rightMenu: { position: 'absolute', right: -10 },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12, backgroundColor: c.bg },
  blockedIcon: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  blockedTitle: { marginTop: 8, fontFamily: FONT.semibold, fontSize: 20, lineHeight: 28, color: c.text },
  blockedBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2, textAlign: 'center' },
  blockedBtn: {
    marginTop: 16, width: 200, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  blockedBtnText: { fontFamily: FONT.semibold, fontSize: 16, color: c.text },
  topRow: { height: 32, justifyContent: 'center' },
  logo: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  iconBtn: { position: 'absolute', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  leftBtn: { left: -10 },
  rightBtn: { right: -10 },
  userRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  avatarLetter: { fontFamily: FONT.semibold, fontSize: 18, color: c.ink },
  headerInfo: { flex: 1, minWidth: 0 },
  username: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22, color: c.text },
  stats: { ...monoLabel(12, 0.06), fontFamily: FONT.mono, lineHeight: 18, color: c.navOff },
  statsValue: { ...monoLabel(14, 0.02), color: c.text },
  segment: {
    flexDirection: 'row', gap: 2, padding: 2, borderRadius: 14,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
  },
  segmentBtn: { width: 44, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: c.point },
  myLocBtn: {
    position: 'absolute', right: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22,
    ...elevationStyle(c),
  },
  myLocGlass: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  toastShadow: { position: 'absolute', alignSelf: 'center', borderRadius: 16, ...elevationStyle(c) },
  shareShadow: { position: 'absolute', alignSelf: 'center', borderRadius: 22, ...elevationStyle(c) },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: c.accent },
  shareText: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20, color: c.ink },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  toast: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center' },
  toastTitle: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text },
  toastSub: { ...monoLabel(10, 0.08), lineHeight: 14, color: c.muted },
});
