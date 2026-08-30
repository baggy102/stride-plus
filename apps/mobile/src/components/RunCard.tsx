import { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
  const [activeIdx, setActiveIdx] = useState(0);

  if (images.length === 0) return null;

  return (
    <View style={{ overflow: 'hidden' }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / screenWidth));
        }}
        style={{ width: screenWidth, height: 240 }}
      >
        {images.map((uri, i) => (
          <Image
            key={i}
            source={{ uri: `${BASE_URL}${uri}` }}
            style={{ width: screenWidth, height: 240 }}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View
          style={{
            position: 'absolute',
            bottom: 10,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 5,
          }}
        >
          {images.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === activeIdx ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === activeIdx ? '#B3E5FC' : 'rgba(255,255,255,0.35)',
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
    <View style={{ borderBottomWidth: 1, borderBottomColor: '#1F1F1F', paddingBottom: 4 }}>
      {/* 프로필 헤더 */}
      <Pressable
        className="flex-row items-center gap-3 active:opacity-70 px-4 pt-4 pb-3"
        onPress={() => router.push(`/user/${run.userId._id}`)}
      >
        {run.userId.profileImageUrl ? (
          <Image
            source={{ uri: run.userId.profileImageUrl }}
            className="w-10 h-10 rounded-full bg-brand-surface"
          />
        ) : (
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: '#B3E5FC' }}
          >
            <Text style={{ color: '#01579B', fontSize: 14, fontWeight: 'bold' }}>
              {(run.userId.username ?? '?')[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View>
          <Text className="text-brand-text-primary font-semibold">
            {run.userId.username || '알 수 없음'}
          </Text>
          <Text className="text-brand-text-secondary text-xs">{formatDate(run.createdAt)}</Text>
        </View>
      </Pressable>

      {/* 풀블리드 이미지 캐러셀 */}
      <ImageCarousel images={images} />

      {/* 스탯 */}
      <View className="flex-row gap-6 px-4 pt-3 pb-2">
        <View>
          <Text className="text-brand-muted text-xs uppercase tracking-widest">거리</Text>
          <Text className="text-2xl font-bold tabular-nums" style={{ color: '#B3E5FC' }}>
            {run.distanceKm.toFixed(2)}{' '}
            <Text className="text-brand-text-secondary text-sm">km</Text>
          </Text>
        </View>
        <View>
          <Text className="text-brand-muted text-xs uppercase tracking-widest">페이스</Text>
          <Text className="text-brand-text-primary text-2xl font-bold tabular-nums">
            {formatPace(run.paceSecPerKm)}{' '}
            <Text className="text-brand-text-secondary text-sm">/km</Text>
          </Text>
        </View>
      </View>

      {/* SNS 반응 바 */}
      <View
        className="flex-row gap-5 px-4 py-3"
        style={{ borderTopWidth: 1, borderTopColor: '#1F1F1F' }}
      >
        <Pressable className="flex-row items-center gap-1.5 active:opacity-60">
          <Ionicons name="heart-outline" size={20} color="#404040" />
          <Text className="text-brand-muted text-sm">좋아요</Text>
        </Pressable>
        <Pressable className="flex-row items-center gap-1.5 active:opacity-60">
          <Ionicons name="chatbubble-outline" size={19} color="#404040" />
          <Text className="text-brand-muted text-sm">댓글</Text>
        </Pressable>
        <Pressable className="flex-row items-center gap-1.5 active:opacity-60">
          <Ionicons name="arrow-redo-outline" size={20} color="#404040" />
          <Text className="text-brand-muted text-sm">공유</Text>
        </Pressable>
      </View>
    </View>
  );
}
