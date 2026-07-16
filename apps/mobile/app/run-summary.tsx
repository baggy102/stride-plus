import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, TextInput,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRunStore } from '@/store/run';
import client from '@/api/client';
import { AppLogo } from '@/components/AppLogo';
import { FadeInUp } from '@/components/RunSummary/FadeInUp';
import { PhotoPicker } from '@/components/RunSummary/PhotoPicker';
import { MiniMap } from '@/components/RunSummary/MiniMap';
import { generateRouteImage } from '@/components/RunSummary/generateRouteImage';

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatPace(sec: number) {
  if (sec === 0) return "--'--\"";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

export default function RunSummaryScreen() {
  const router = useRouter();
  const pendingSummary = useRunStore((s) => s.pendingSummary);
  const resetRun = useRunStore((s) => s.resetRun);
  const clearPendingSummary = useRunStore((s) => s.clearPendingSummary);

  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // 요약 데이터 없이 직접 진입한 경우(새로고침 등) 기록 탭으로 되돌림
  useEffect(() => {
    if (!pendingSummary) router.replace('/(tabs)/record');
  }, [pendingSummary, router]);

  if (!pendingSummary) return null;
  const summary = pendingSummary;

  const handleDiscard = () => {
    resetRun();
    router.replace('/(tabs)/record');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
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

      await client.post('/posts', { runId: run._id });

      clearPendingSummary();
      resetRun();
      router.replace('/(tabs)/feed');
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const [whole, frac] = summary.distanceKm.toFixed(2).split('.');

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <LinearGradient
        colors={['#0D1A20', '#0A0A0A', '#0A0A0A']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420 }}
      />

      {/* 후광 효과 */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 70, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(179,229,252,0.06)' }} />
        <View style={{ position: 'absolute', top: 60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(179,229,252,0.10)' }} />
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 28 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FadeInUp duration={450} style={{ alignItems: 'center' }}>
              <AppLogo size="sm" />
            </FadeInUp>

            {/* 히어로: 거리 */}
            <FadeInUp delay={120} duration={600} style={{ alignItems: 'center' }}>
              <View style={styles.runCompleteRow}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#B3E5FC' }} />
                <Text style={styles.runCompleteLabel}>
                  Run Complete
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text
                  style={{ color: '#F5F5F5', fontSize: 88, fontWeight: '900', letterSpacing: -3, lineHeight: 92, fontVariant: ['tabular-nums'] }}
                >
                  {whole}
                </Text>
                <Text
                  style={{ color: '#B3E5FC', fontSize: 44, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'] }}
                >
                  .{frac}
                </Text>
              </View>
              <Text style={styles.kilometersLabel}>Kilometers</Text>
            </FadeInUp>

            {/* 시간 / 페이스 */}
            <FadeInUp delay={220} duration={500} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={styles.statCol}>
                <Text style={styles.label}>시간</Text>
                <Text style={styles.statValue}>
                  {formatTime(summary.elapsedSeconds)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: '#1F1F1F' }} />
              <View style={styles.statCol}>
                <Text style={styles.label}>페이스</Text>
                <Text style={styles.statValue}>
                  {formatPace(summary.paceSecPerKm)}
                </Text>
                <Text style={styles.unit}>/km</Text>
              </View>
            </FadeInUp>

            {/* 경로 */}
            <FadeInUp delay={320} duration={500}>
              <Text style={styles.sectionLabel}>경로</Text>
              <MiniMap coordinates={summary.coordinates} />
            </FadeInUp>

            {/* 사진 */}
            <FadeInUp delay={400} duration={500}>
              <PhotoPicker photos={photos} onChange={setPhotos} />
            </FadeInUp>

            {/* 소감 */}
            <FadeInUp delay={480} duration={500}>
              <Text style={styles.sectionLabel}>소감</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="오늘 러닝은 어땠나요? (선택)"
                placeholderTextColor="#808080"
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: '#141414', borderColor: '#1F1F1F', borderWidth: 1,
                  color: '#F5F5F5', borderRadius: 16, padding: 16, minHeight: 88,
                  textAlignVertical: 'top',
                }}
              />
            </FadeInUp>
          </ScrollView>

          <FadeInUp
            delay={560}
            duration={500}
            style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 }}
          >
            <Pressable
              onPress={handleDiscard}
              disabled={saving}
              style={({ pressed }) => [
                styles.discardButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.discardText}>취소</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: saving ? '#404040' : '#B3E5FC', opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <Text style={styles.saveText}>저장하기</Text>
              )}
            </Pressable>
          </FadeInUp>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  runCompleteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  runCompleteLabel: { color: '#808080', fontSize: 12, textTransform: 'uppercase', letterSpacing: 3 },
  kilometersLabel: { color: '#404040', fontSize: 14, textTransform: 'uppercase', letterSpacing: 4, marginTop: 4 },
  statCol: { alignItems: 'center', flex: 1 },
  label: { color: '#808080', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  statValue: { color: '#F5F5F5', fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  unit: { color: '#404040', fontSize: 12 },
  sectionLabel: { color: '#808080', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  discardButton: {
    flex: 1, borderWidth: 1, borderColor: '#1F1F1F', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  discardText: { color: '#808080', fontWeight: '600' },
  saveButton: { flex: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: '#01579B', fontWeight: '700' },
});
