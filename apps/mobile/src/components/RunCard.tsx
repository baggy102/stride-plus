import { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { BASE_URL } from '@/api/client';

export interface RunMarker {
  _id: string;
  userId: { _id: string; username?: string; profileImageUrl?: string };
  distanceKm: number;
  paceSecPerKm: number;
  routeImageUrl: string | null;
  thumbnailUrl: string | null;
  photoUrls: string[];
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

function ImageCarousel({ images }: { images: string[] }) {
  const { width: screenWidth } = useWindowDimensions();
  const imgWidth = screenWidth - 32; // px-4 (16px) * 2
  const [activeIdx, setActiveIdx] = useState(0);

  if (images.length === 0) return null;

  return (
    <View style={{ borderRadius: 16, overflow: 'hidden' }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / imgWidth));
        }}
        style={{ width: imgWidth, height: 192 }}
      >
        {images.map((uri, i) => (
          <Image
            key={i}
            source={{ uri: `${BASE_URL}${uri}` }}
            style={{ width: imgWidth, height: 192 }}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View
          style={{
            position: 'absolute',
            bottom: 8,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {images.map((_, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === activeIdx ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

interface Props {
  run: RunMarker;
}

export function RunCard({ run }: Props) {
  const router = useRouter();
  const images = [run.routeImageUrl, ...run.photoUrls].filter(Boolean) as string[];

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
            {run.userId.username || '알 수 없음'}
          </Text>
          <Text className="text-zinc-400 text-xs">{formatDate(run.createdAt)}</Text>
        </View>
      </Pressable>

      {/* 이미지 캐러셀 */}
      <ImageCarousel images={images} />

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
