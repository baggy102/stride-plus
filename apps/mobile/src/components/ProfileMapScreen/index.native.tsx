import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, ScrollView } from 'react-native';
import client, { BASE_URL } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { RunMarker } from '../RunCard';

interface UserProfile {
  _id: string;
  username: string;
  profileImageUrl?: string;
}

interface RunWithRoute extends RunMarker {
  route: [number, number][];
}

interface Props {
  userId?: string;
}

function formatPace(sec: number) {
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

export function ProfileMapScreen({ userId }: Props) {
  const { user } = useAuthStore();
  const targetId = userId ?? user?._id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [runs, setRuns] = useState<RunWithRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!targetId) return;
    let done = 0;
    const finish = () => { if (++done === 2) setLoading(false); };

    client.get<UserProfile>(`/users/${targetId}`)
      .then(({ data }) => setProfile(data))
      .catch((e) => console.error('[profile] users fetch failed', e))
      .finally(finish);

    client.get<RunWithRoute[]>(`/runs?userId=${targetId}&limit=50`)
      .then(({ data }) => setRuns(data))
      .catch((e) => console.error('[profile] runs fetch failed', e))
      .finally(finish);
  }, [targetId]);

  const totalKm = runs.reduce((s, r) => s + r.distanceKm, 0);
  const displayName = profile?.username ?? user?.username ?? '';
  const avatarLetter = (displayName || '?')[0].toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {profile?.profileImageUrl ? (
            <Image source={{ uri: profile.profileImageUrl }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarLetter}>{avatarLetter}</Text>
          )}
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.username}>{displayName}</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#71717a" />
          ) : (
            <Text style={styles.stats}>{totalKm.toFixed(1)} km · {runs.length}회</Text>
          )}
          <Text style={styles.note}>지도는 웹 버전에서 확인하세요</Text>
        </View>
      </View>

      {runs.map((run) => (
        <View key={run._id} style={styles.card}>
          {run.thumbnailUrl && (
            <Image
              source={{ uri: `${BASE_URL}${run.thumbnailUrl}` }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          )}
          <View style={styles.cardStats}>
            <View>
              <Text style={styles.label}>거리</Text>
              <Text style={styles.value}>{run.distanceKm.toFixed(2)} km</Text>
            </View>
            <View>
              <Text style={styles.label}>페이스</Text>
              <Text style={styles.value}>{formatPace(run.paceSecPerKm)}</Text>
            </View>
          </View>
          <Text style={styles.date}>{new Date(run.createdAt).toLocaleDateString('ko-KR')}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, backgroundColor: '#fff', gap: 14, borderBottomWidth: 1, borderBottomColor: '#e4e4e7' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e53935', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  headerInfo: { flex: 1 },
  username: { fontSize: 18, fontWeight: '700', color: '#18181b' },
  stats: { fontSize: 13, color: '#71717a', marginTop: 2 },
  note: { fontSize: 11, color: '#a1a1aa', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, margin: 12, marginBottom: 0, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  thumbnail: { width: '100%', height: 160 },
  cardStats: { flexDirection: 'row', gap: 24, padding: 14 },
  label: { fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 18, fontWeight: '700', color: '#18181b', marginTop: 2 },
  date: { fontSize: 12, color: '#a1a1aa', paddingHorizontal: 14, paddingBottom: 14 },
});
