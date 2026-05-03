import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import client from '@/api/client';
import { RunCard, RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };

export function MapFeed() {
  const [runs, setRuns] = useState<RunMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loc, setLoc] = useState(SEOUL);

  useEffect(() => {
    const init = async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation?.getCurrentPosition(res, rej, { timeout: 5000 }),
        ).catch(() => null);

        const lat = pos?.coords.latitude ?? SEOUL.lat;
        const lng = pos?.coords.longitude ?? SEOUL.lng;
        setLoc({ lat, lng });

        const { data } = await client.get<RunMarker[]>(
          `/runs?lat=${lat}&lng=${lng}&radius=10000`,
        );
        setRuns(data);
      } catch {
        // 조용히 실패
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  const d = 0.03;
  const bbox = `${loc.lng - d},${loc.lat - d},${loc.lng + d},${loc.lat + d}`;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat},${loc.lng}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>주변 러닝</Text>
      </View>

      {/* @ts-ignore — iframe은 Expo web 컨텍스트에서 유효 */}
      <iframe
        src={mapSrc}
        style={{ width: '100%', height: 320, border: 'none', display: 'block' }}
        title="map"
      />

      {runs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>주변 러닝 기록이 없습니다</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 32 }}>
          {runs.map((run) => (
            <View key={run._id} style={styles.item}>
              <RunCard run={run} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  center: { flex: 1, backgroundColor: '#09090b', alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#71717a' },
  list: { flex: 1 },
  item: { borderBottomWidth: 1, borderBottomColor: '#27272a', paddingVertical: 8 },
});
