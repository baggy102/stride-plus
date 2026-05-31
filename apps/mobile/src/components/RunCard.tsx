import { View, Text, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';

export interface RunMarker {
  _id: string;
  userId: { _id: string; username?: string; profileImageUrl?: string };
  distanceKm: number;
  paceSecPerKm: number;
  thumbnailUrl: string | null;
  startPoint: [number, number] | null;
  createdAt: string;
}

function formatPace(sec: number) {
  if (!sec) return '--\'--"';
  return `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

interface Props {
  run: RunMarker;
}

export function RunCard({ run }: Props) {
  const router = useRouter();

  return (
    <View className="px-4 pb-8 gap-4">
      {/* 프로필 헤더 */}
      <Pressable
        className="flex-row items-center gap-3 active:opacity-70"
        onPress={() => router.push(`/user/${run.userId._id}`)}
      >
        {run.userId.profileImageUrl ? (
          <Image
            source={{ uri: run.userId.profileImageUrl }}
            className="w-10 h-10 rounded-full bg-zinc-700"
          />
        ) : (
          <View className="w-10 h-10 rounded-full bg-zinc-700 items-center justify-center">
            <Text className="text-white text-sm font-bold">
              {(run.userId.username ?? '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View>
          <Text className="text-white font-semibold">
            {run.userId.username ?? '알 수 없음'}
          </Text>
          <Text className="text-zinc-400 text-xs">{formatDate(run.createdAt)}</Text>
        </View>
      </Pressable>

      {/* 썸네일 */}
      {run.thumbnailUrl && (
        <Image
          source={{ uri: run.thumbnailUrl }}
          className="w-full h-48 rounded-2xl bg-zinc-800"
          resizeMode="cover"
        />
      )}

      {/* 스탯 */}
      <View className="flex-row gap-6">
        <View>
          <Text className="text-zinc-400 text-xs uppercase tracking-widest">거리</Text>
          <Text className="text-white text-xl font-bold">
            {run.distanceKm.toFixed(2)} <Text className="text-zinc-400 text-sm">km</Text>
          </Text>
        </View>
        <View>
          <Text className="text-zinc-400 text-xs uppercase tracking-widest">페이스</Text>
          <Text className="text-white text-xl font-bold">
            {formatPace(run.paceSecPerKm)} <Text className="text-zinc-400 text-sm">/km</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}
