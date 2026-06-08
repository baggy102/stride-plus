import { useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { RunSummary, useRunStore } from '@/store/run';
import client from '@/api/client';
import { StatBadge } from './StatBadge';
import { PhotoPicker } from './PhotoPicker';
import { MiniMap } from './MiniMap';
import { generateRouteImage } from './generateRouteImage';

interface Props {
  summary: RunSummary;
  onClose: () => void;
}

export function RunSummaryModal({ summary, onClose }: Props) {
  const router = useRouter();
  const resetRun = useRunStore((s) => s.resetRun);
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCancel = () => {
    resetRun();
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. POST /runs (multipart/form-data)
      const form = new FormData();
      form.append('coordinates', JSON.stringify(summary.coordinates));
      form.append('distanceKm', String(summary.distanceKm));
      form.append('paceSecPerKm', String(summary.paceSecPerKm));
      form.append('description', description);

      const routeFile = await generateRouteImage(summary.coordinates);
      if (routeFile) {
        form.append('routeImage', routeFile as unknown as Blob);
      }

      photos.forEach((uri, i) => {
        const ext = uri.split('.').pop() ?? 'jpg';
        const name = `photo_${i}.${ext}`;
        form.append('photos', { uri, name, type: `image/${ext}` } as unknown as Blob);
      });

      const { data: run } = await client.post<{ _id: string }>('/runs', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // 2. POST /posts
      await client.post('/posts', { runId: run._id });

      resetRun();
      onClose();
      router.replace('/(tabs)/feed');
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View className="flex-1 justify-end bg-black/70">
        <View className="bg-zinc-900 rounded-t-3xl max-h-[92%]">
          <ScrollView
            className="p-6"
            contentContainerStyle={{ gap: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-white text-2xl font-bold text-center">러닝 완료 🎉</Text>

            <MiniMap coordinates={summary.coordinates} />

            <StatBadge
              distanceKm={summary.distanceKm}
              paceSecPerKm={summary.paceSecPerKm}
              elapsedSeconds={summary.elapsedSeconds}
            />

            <PhotoPicker photos={photos} onChange={setPhotos} />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="오늘 러닝은 어땠나요? (선택)"
              placeholderTextColor="#71717a"
              multiline
              numberOfLines={3}
              className="bg-zinc-800 text-white rounded-2xl p-4 min-h-[80px]"
              style={{ textAlignVertical: 'top' }}
            />
          </ScrollView>

          <View className="flex-row gap-3 px-6 pb-8 pt-2">
            <Pressable
              onPress={handleCancel}
              className="flex-1 border border-zinc-600 rounded-2xl py-4 items-center active:opacity-70"
              disabled={saving}
            >
              <Text className="text-zinc-300 font-semibold">취소</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 rounded-2xl py-4 items-center active:opacity-80"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold">저장하기</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
