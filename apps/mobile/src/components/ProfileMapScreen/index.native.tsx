import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, Pressable, type LayoutChangeEvent } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import client, { BASE_URL } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { Wordmark } from '@/components/Wordmark';
import { MapPopupCard } from '@/components/MapPopupCard';
import { BackIcon, BlockedIcon, GearIcon, ListIcon, LocateIcon, MapIcon } from '@/components/icons';
import { SafetyMenu } from '@/components/SafetyMenu';
import { useTabBarClearance } from '@/components/FloatingTabBar';
import { CARTO_TILE_URL, CARTO_ATTRIBUTION } from '@/config/mapTiles';
import { useColors, useScheme } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import { withAlpha, type Palette } from '@/theme/colors';
import { leafletHead, markerIconsScript, MARKER_PULSE_CSS } from '@/components/map/mapHtml';
import { RunList, type ListState, type RunWithRoute } from './RunList';

interface UserProfile {
  _id: string;
  username: string;
  profileImageUrl?: string;
  /** 내가 차단한 사용자(C1) */
  blockedByMe?: boolean;
}

interface Props {
  userId?: string;
}

type ProfileView = 'map' | 'list';

const PAGE_SIZE = 20;

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
    .map-tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(1.6) contrast(0.8) saturate(0.5) !important; }
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
  L.tileLayer('${CARTO_TILE_URL}', {
    attribution: '${CARTO_ATTRIBUTION}',
    className: '${dark ? 'map-tiles-dark' : ''}'
  }).addTo(map);
${markerIconsScript(p)}
  var group = L.markerClusterGroup({ iconCreateFunction: clusterIcon, showCoverageOnHover: false, maxClusterRadius: 60 });
  map.addLayer(group);
  var fitted = false;

  // 처음 받은 러닝에만 화면을 맞춘다(새로고침·다음 페이지로 다시 들어와도 보던 위치 유지)
  window.__setRuns = function(runs) {
    group.clearLayers();
    var all = [];
    runs.forEach(function(run) {
      if (!run.startPoint) return;
      var latLng = [run.startPoint[1], run.startPoint[0]];
      all.push(latLng);
      var marker = L.marker(latLng, { icon: dotIcon });
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
export function ProfileMapScreen({ userId }: Props) {
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
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [listState, setListState] = useState<ListState>('loading');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState<ProfileView>('map');
  const [selected, setSelected] = useState<RunWithRoute | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const mapLoaded = useRef(false);
  const html = useMemo(() => buildHtml(c, dark), [c, dark]);

  // 지도에 러닝을 넣는다 — WebView를 다시 로드하지 않는다
  const pushRuns = useCallback(() => {
    if (!mapLoaded.current) return;
    webViewRef.current?.injectJavaScript(`window.__setRuns(${JSON.stringify(runs)});true;`);
  }, [runs]);

  useEffect(pushRuns, [pushRuns]);

  const fetchPage = useCallback(
    (nextPage: number) => client.get<RunWithRoute[]>(`/runs?userId=${targetId}&page=${nextPage}&limit=${PAGE_SIZE}`),
    [targetId],
  );

  // 첫 페이지와 프로필을 다시 불러온다. refresh면 지금 화면을 유지한 채 당겨서 새로고침
  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (!targetId) return;
    if (mode === 'initial') setListState('loading');
    else setRefreshing(true);
    try {
      const [profileRes, runsRes] = await Promise.all([client.get<UserProfile>(`/users/${targetId}`), fetchPage(1)]);
      setProfile(profileRes.data);
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

  // 탭 재진입 시 화면을 유지한 채 다시 불러온다
  const skipFirstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (skipFirstFocus.current) { skipFirstFocus.current = false; return; }
    load('refresh');
  }, [load]));

  const handleMyLocation = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webViewRef.current?.injectJavaScript(`map.flyTo([${latitude}, ${longitude}], 14); true;`);
    } catch {}
  }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/feed'));
  const openRun = (runId: string) => router.push(`/run/${runId}`);

  const totalKm = runs.reduce((sum, run) => sum + run.distanceKm, 0);
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
              style={StyleSheet.absoluteFillObject}
              originWhitelist={['*']}
              onLoadStart={() => { mapLoaded.current = false; }}
              onLoadEnd={() => { mapLoaded.current = true; pushRuns(); }}
              onMessage={(e) => {
                try { setSelected(JSON.parse(e.nativeEvent.data)); } catch {}
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
              <LocateIcon color={c.value} />
            </Pressable>
          )}
          {showMap ? null : view === 'map' && listState === 'loading' ? (
            <View accessibilityLabel="불러오는 중" style={styles.center}>
              <ActivityIndicator color={c.value} size="large" />
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: c.bg }]}>
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
        style={[styles.header, { paddingTop: insets.top + 4 }, blocked && styles.headerBlocked]}
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
              <Text style={styles.stats}>
                {listState === 'ready' ? `${totalKm.toFixed(1)} km · ${runs.length}${hasMore ? '+' : ''}회` : ' '}
              </Text>
            </View>
            <View accessibilityRole="tablist" accessibilityLabel="기록 보기 방식" style={styles.segment}>
              {(['map', 'list'] as const).map((id) => {
                const on = view === id;
                const Icon = id === 'map' ? MapIcon : ListIcon;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={id === 'map' ? '지도 보기' : '목록 보기'}
                    onPress={() => { setView(id); setSelected(null); }}
                    style={[styles.segmentBtn, on && { backgroundColor: c.accent }]}
                  >
                    <Icon color={on ? c.ink : c.text2} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* 선택된 런 카드 */}
      {showMap && selected && (
        <MapPopupCard
          run={selected}
          baseUrl={BASE_URL}
          bottom={bottomBase}
          onClose={() => setSelected(null)}
          onDetailPress={openRun}
        />
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
  stats: { fontFamily: FONT.num, fontSize: 13, lineHeight: 18, color: c.text2 },
  segment: { height: 50, padding: 3, borderRadius: 13, backgroundColor: c.surface2, flexDirection: 'row', gap: 2 },
  segmentBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  myLocBtn: {
    position: 'absolute', right: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: c.border, shadowColor: c.shadow, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
});
