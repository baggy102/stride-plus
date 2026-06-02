import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import client, { BASE_URL } from '@/api/client';
import { RunMarker } from '../RunCard';
import * as Location from 'expo-location';

export function MapFeed() {
  const [runs, setRuns] = useState<RunMarker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async (lat: number, lng: number) => {
    try {
      const { data } = await client.get<RunMarker[]>(
        `/runs?lat=${lat}&lng=${lng}&radius=15000`,
      );
      setRuns(data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        fetchRuns(loc.coords.latitude, loc.coords.longitude);
      } else {
        fetchRuns(37.5665, 126.978);
      }
    })();
  }, [fetchRuns]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#e53935" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>주변 러닝 ({runs.length}개)</Text>
      <Text style={styles.note}>지도는 웹 버전에서 확인하세요</Text>
      {runs.map((run) => (
        <View key={run._id} style={styles.card}>
          {run.thumbnailUrl && (
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            <View style={styles.thumb}>
              <Text style={styles.thumbText}>📍</Text>
            </View>
          )}
          <Text style={styles.cardUser}>{run.userId?.username ?? '알 수 없음'}</Text>
          <Text style={styles.cardStat}>{run.distanceKm.toFixed(2)} km</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16, paddingTop: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#09090b', marginBottom: 4 },
  note: { fontSize: 12, color: '#a1a1aa', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  thumbText: { fontSize: 20 },
  cardUser: { fontWeight: '600', color: '#18181b', marginBottom: 2 },
  cardStat: { color: '#71717a', fontSize: 13 },
});
