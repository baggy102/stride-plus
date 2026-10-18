import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CardCarousel } from './CardCarousel';
import { RunMarker } from '../RunCard';
import { CloseIcon } from '../icons';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';

interface Props {
  run: RunMarker;
  baseUrl: string;
  onClose: () => void;
  onUserPress?: (userId: string) => void;
  /** 화면 아래에서 띄울 거리. 탭 화면은 탭바 위로 올린다 */
  bottom?: number;
}

function formatPace(sec: number) {
  if (!sec) return "--'--\"";
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

/** 지도 마커 탭 시 뜨는 러닝 요약 카드 — 확정 UI S05 (네이티브 전용, WebView 밖에서 렌더링) */
export function MapPopupCard({ run, baseUrl, onClose, onUserPress, bottom = 24 }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const photos = [run.routeImageUrl, ...run.photoUrls].filter(Boolean) as string[];
  const username = run.userId.username || '알 수 없음';

  return (
    <View accessibilityLabel="러닝 요약" style={[styles.card, { bottom }]}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole={onUserPress ? 'button' : undefined}
          disabled={!onUserPress}
          style={styles.userRow}
          onPress={() => onUserPress?.(run.userId._id)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{(username[0] ?? '?').toUpperCase()}</Text>
          </View>
          <Text style={styles.username}>{username}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={styles.closeBtn} onPress={onClose}>
          <CloseIcon color={c.muted} />
        </Pressable>
      </View>

      <CardCarousel key={run._id} imgs={photos} baseUrl={baseUrl} />

      <View style={styles.statsRow}>
        <View>
          <Text style={styles.statLabel}>Distance</Text>
          <Text style={styles.statValue}>
            {run.distanceKm.toFixed(2)}
            <Text style={styles.statUnit}> KM</Text>
          </Text>
        </View>
        <View>
          <Text style={styles.statLabel}>Avg Pace</Text>
          <Text style={styles.statValue}>{formatPace(run.paceSecPerKm)}</Text>
        </View>
        <Text style={styles.date}>{new Date(run.createdAt).toLocaleDateString('ko-KR')}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  card: {
    position: 'absolute', left: 16, right: 16,
    paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16, gap: 10,
    borderRadius: 20, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border,
    shadowColor: c.shadow, shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  headerRow: { height: 36, flexDirection: 'row', alignItems: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: FONT.semibold, fontSize: 12, color: c.ink },
  username: { fontFamily: FONT.bold, fontSize: 14, lineHeight: 20, color: c.text },
  closeBtn: { marginLeft: 'auto', marginRight: -10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 28 },
  statLabel: { fontFamily: FONT.semibold, fontSize: 11, lineHeight: 15, color: c.text2 },
  statValue: { fontFamily: FONT.num, fontSize: 17, lineHeight: 22, color: c.value },
  statUnit: { fontFamily: FONT.num, fontSize: 12, color: c.text2 },
  date: { marginLeft: 'auto', fontFamily: FONT.regular, fontSize: 12, lineHeight: 18, color: c.text2 },
});
