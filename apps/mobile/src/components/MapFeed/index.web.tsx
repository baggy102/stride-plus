import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import client from '@/api/client';
import { RunCard, RunMarker } from '../RunCard';

const SEOUL = { lat: 37.5665, lng: 126.978 };

export function MapFeed() {
  const [runs, setRuns] = useState<RunMarker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation?.getCurrentPosition(res, rej, { timeout: 5000 }),
        ).catch(() => null);

        const lat = pos?.coords.latitude ?? SEOUL.lat;
        const lng = pos?.coords.longitude ?? SEOUL.lng;
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
    fetchRuns();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-zinc-950 items-center justify-center">
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-zinc-950">
      <View className="px-4 pt-12 pb-4">
        <Text className="text-white text-xl font-bold">주변 러닝</Text>
      </View>
      {runs.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-zinc-500">주변 러닝 기록이 없습니다</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
          {runs.map((run) => (
            <View key={run._id} className="border-b border-zinc-800 py-2">
              <RunCard run={run} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
