import { useMemo } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { RunMarker } from '../RunCard';
import { CloseIcon } from '../icons';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';
import { formatDuration, formatPace } from '@/utils/pace';
import { formatDay } from '@/utils/date';

interface Props {
  run: RunMarker;
  baseUrl: string;
  onClose: () => void;
  onUserPress?: (userId: string) => void;
  /** 「코스 보기」를 누르면 러닝 상세(S10)로 */
  onDetailPress?: (runId: string) => void;
  /** 화면 아래에서 띄울 거리. 탭 화면은 탭바 위로 올린다 */
  bottom?: number;
}

/**
 * 지도 마커 탭 시 뜨는 러닝 요약 카드 — Frost S05 (네이티브 전용, WebView 밖에서 렌더링).
 * 코스 이름 / 「작성자 · 08.30 일」 / 코스 보기 · 닫기, 아래에 거리 크게 + TIME·PACE. 경로는 지도에 그린다
 */
export function MapPopupCard({ run, baseUrl, onClose, onUserPress, onDetailPress, bottom = 24 }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const username = run.userId.username || '알 수 없음';
  const title = run.description?.trim() || '러닝 기록';
  const avatar = run.userId.profileImageUrl;

  return (
    <View accessibilityLabel="러닝 요약" style={[styles.card, { bottom }]}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole={onUserPress ? 'button' : undefined}
          accessibilityLabel={`${username} 프로필 보기`}
          disabled={!onUserPress}
          onPress={() => onUserPress?.(run.userId._id)}
          style={styles.avatar}
        >
          {avatar ? (
            <Image source={{ uri: avatar.startsWith('/') ? `${baseUrl}${avatar}` : avatar }} style={StyleSheet.absoluteFillObject} />
          ) : (
            <Text style={styles.avatarLetter}>{(username[0] ?? '?').toUpperCase()}</Text>
          )}
        </Pressable>
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{`${username} · ${formatDay(run.createdAt)}`}</Text>
        </View>
        {onDetailPress && (
          <Pressable accessibilityRole="button" onPress={() => onDetailPress(run._id)} style={styles.courseBtn} hitSlop={6}>
            <Text style={styles.courseText}>코스 보기</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" style={styles.closeBtn} onPress={onClose}>
          <CloseIcon size={18} color={c.text2} />
        </Pressable>
      </View>

      <View style={styles.statsRow} accessible accessibilityLabel={`거리 ${run.distanceKm.toFixed(1)} km`}>
        <Text style={styles.distance}>{run.distanceKm.toFixed(1)}</Text>
        <Text style={styles.distanceUnit}>KM</Text>
        <View style={styles.minor}>
          <View style={styles.minorItem}>
            <Text style={styles.minorValue}>{formatDuration(run.paceSecPerKm * run.distanceKm)}</Text>
            <Text style={styles.minorLabel}>TIME</Text>
          </View>
          <View style={styles.minorItem}>
            <Text style={styles.minorValue}>{formatPace(run.paceSecPerKm)}</Text>
            <Text style={styles.minorLabel}>PACE</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  card: {
    position: 'absolute', left: 12, right: 12, height: 152,
    paddingTop: 16, paddingHorizontal: 18,
    borderRadius: 24, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border,
    shadowColor: c.shadow, shadowOpacity: c.dark ? 0.45 : 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 34, height: 34, borderRadius: 17, overflow: 'hidden', backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: FONT.semibold, fontSize: 13, color: c.ink },
  titleCol: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 20, color: c.text },
  meta: { ...monoLabel(12, 0.04), lineHeight: 17, color: c.navOff },
  courseBtn: {
    height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center',
    borderWidth: 1, borderColor: c.glassBorder,
  },
  courseText: { fontFamily: FONT.regular, fontSize: 12, color: c.text },
  closeBtn: { marginVertical: -5, marginRight: -12, marginLeft: -4, width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
  distance: { fontFamily: FONT.num, fontSize: 56, lineHeight: 60, letterSpacing: -1.1, color: c.text },
  distanceUnit: { ...monoLabel(15, 0), lineHeight: 40, marginLeft: 6, color: c.navOff },
  minor: { marginLeft: 'auto', flexDirection: 'row', gap: 18, paddingBottom: 8 },
  minorItem: { alignItems: 'flex-end' },
  minorValue: { fontFamily: FONT.num, fontSize: 17, lineHeight: 22, color: c.text },
  minorLabel: { ...monoLabel(9.5), lineHeight: 13, color: c.navOff },
});
