import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CardCarousel } from './CardCarousel';
import { RunMarker } from '../RunCard';

interface Props {
  run: RunMarker;
  baseUrl: string;
  onClose: () => void;
  onUserPress?: (userId: string) => void;
}

function formatPace(sec: number) {
  if (!sec) return "--'--\"";
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

/** 지도 마커 탭 시 뜨는 러닝 요약 카드 (네이티브 전용, WebView 밖에서 렌더링) */
export function MapPopupCard({ run, baseUrl, onClose, onUserPress }: Props) {
  const photos = [run.routeImageUrl, ...run.photoUrls].filter(Boolean) as string[];

  return (
    <View style={styles.card}>
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeTxt}>✕</Text>
      </Pressable>

      {onUserPress && (
        <Pressable
          style={styles.userRow}
          onPress={() => onUserPress(run.userId._id)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {(run.userId.username || '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.username}>{run.userId.username || '알 수 없음'}</Text>
        </Pressable>
      )}

      <CardCarousel key={run._id} imgs={photos} baseUrl={baseUrl} />

      <View style={styles.statsRow}>
        <View>
          <Text style={styles.statLabel}>거리</Text>
          <Text style={styles.statValue}>{run.distanceKm.toFixed(2)} km</Text>
        </View>
        <View>
          <Text style={styles.statLabel}>페이스</Text>
          <Text style={styles.statValue}>{formatPace(run.paceSecPerKm)}</Text>
        </View>
      </View>
      <Text style={styles.date}>
        {new Date(run.createdAt).toLocaleDateString('ko-KR')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    backgroundColor: '#141414', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1F1F1F',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 6,
  },
  closeBtn: { position: 'absolute', top: 12, right: 12, padding: 4, zIndex: 1 },
  closeTxt: { fontSize: 16, color: '#404040' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  avatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#B3E5FC',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { color: '#01579B', fontSize: 12, fontWeight: '700' },
  username: { fontWeight: '600', fontSize: 13, color: '#F5F5F5' },
  statsRow: { flexDirection: 'row', gap: 20, marginBottom: 6 },
  statLabel: { fontSize: 10, color: '#404040', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#B3E5FC', marginTop: 2 },
  date: { fontSize: 11, color: '#808080' },
});
