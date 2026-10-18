import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, Modal,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRunStore } from '@/store/run';
import client from '@/api/client';
import { Wordmark } from '@/components/Wordmark';
import { RouteMap } from '@/components/RouteMap';
import { PhotoPicker } from '@/components/RunSummary/PhotoPicker';
import { generateRouteImage } from '@/components/RunSummary/generateRouteImage';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import { withAlpha, type Palette } from '@/theme/colors';
import { formatPace } from '@/utils/pace';

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 「10월 16일 목요일 · 오전 7:05」
function formatFinishedAt(d: Date) {
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${weekday}요일 · ${ampm} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 확정 UI S07 러닝 요약 — 최종 보드 Summary (경로 지도·거리 크게·Time/Avg Pace·사진·코스 소개·저장, 삭제 확인)
export default function RunSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const pendingSummary = useRunStore((s) => s.pendingSummary);
  const resetRun = useRunStore((s) => s.resetRun);
  const clearPendingSummary = useRunStore((s) => s.clearPendingSummary);

  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [finishedAt] = useState(() => new Date());

  // 요약 데이터 없이 직접 진입한 경우(새로고침 등) 기록 탭으로 되돌림
  useEffect(() => {
    if (!pendingSummary) router.replace('/(tabs)/record');
  }, [pendingSummary, router]);

  if (!pendingSummary) return null;
  const summary = pendingSummary;
  const mapHeight = Math.round(screenHeight * 0.39);

  const handleDiscard = () => {
    setConfirmDelete(false);
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

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* 경로 지도 */}
          <View style={{ height: mapHeight }}>
            <RouteMap coordinates={summary.coordinates} fit="route" style={StyleSheet.absoluteFillObject} />
            <LinearGradient
              pointerEvents="none"
              colors={[withAlpha(c.bg, 0.9), withAlpha(c.bg, 0)]}
              style={[styles.fadeTop, { height: insets.top + 64 }]}
            />
            <LinearGradient pointerEvents="none" colors={[withAlpha(c.bg, 0), c.bg]} style={styles.fadeBottom} />
            <View accessibilityLabel="지도 범례" style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { borderWidth: 2, borderColor: c.value }]} />
                <Text style={styles.legendText}>출발</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c.value }]} />
                <Text style={styles.legendText}>도착</Text>
              </View>
            </View>
          </View>

          {/* 러닝 결과 */}
          <View accessibilityLabel="러닝 결과" style={styles.result}>
            <Text style={styles.date}>{formatFinishedAt(finishedAt)}</Text>
            <View accessibilityLabel={`거리 ${summary.distanceKm.toFixed(2)} km`} style={styles.distanceRow}>
              <Text style={styles.distance}>{summary.distanceKm.toFixed(2)}</Text>
              <Text style={styles.distanceUnit}>KM</Text>
            </View>
            <View style={styles.grid}>
              <View style={styles.cell}>
                <Text style={styles.label}>Time</Text>
                <Text style={styles.cellValue}>{formatTime(summary.elapsedSeconds)}</Text>
              </View>
              <View style={[styles.cell, styles.cellDivider]}>
                <Text style={styles.label}>Avg Pace</Text>
                <Text style={[styles.cellValue, { color: c.value }]}>
                  {formatPace(summary.paceSecPerKm)}
                  <Text style={styles.cellUnit}> /KM</Text>
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.form}>
            <PhotoPicker photos={photos} onChange={setPhotos} />

            <View style={{ gap: 6 }}>
              <Text style={styles.label}>
                코스 소개 <Text style={{ fontFamily: FONT.regular }}>(선택)</Text>
              </Text>
              <TextInput
                accessibilityLabel="코스 소개"
                value={description}
                onChangeText={setDescription}
                placeholder="풍경, 경사, 추천 시간대 등"
                placeholderTextColor={c.muted}
                style={styles.input}
              />
              <Text style={styles.help}>다른 러너가 코스를 고를 때 보여요</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            accessibilityRole="button"
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, { opacity: saving ? 0.8 : 1 }]}
          >
            {saving ? <ActivityIndicator color={c.ink} /> : <Text style={styles.saveText}>저장하기</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* 위쪽: 워드마크 + 삭제 */}
      <View style={[styles.topBar, { top: insets.top + 4 }]} pointerEvents="box-none">
        <View style={styles.logo} pointerEvents="none">
          <Wordmark width={71} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>삭제</Text>
        </Pressable>
      </View>

      {/* 삭제 확인 */}
      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={[styles.scrim, { backgroundColor: c.scrim }]}>
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text style={styles.dialogTitle}>이 기록을 저장하지 않고 삭제할까요?</Text>
            <Text style={styles.dialogBody}>삭제한 기록은 되돌릴 수 없어요.</Text>
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={styles.dialogKeep}>
                <Text style={styles.dialogKeepText}>계속 편집</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={handleDiscard} style={styles.dialogDelete}>
                <Text style={styles.dialogDeleteText}>삭제</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  fadeTop: { position: 'absolute', left: 0, right: 0, top: 0 },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 },
  legend: {
    position: 'absolute', left: 16, bottom: 66, height: 28, paddingHorizontal: 10, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: withAlpha(c.surface, 0.92), borderWidth: 1, borderColor: c.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontFamily: FONT.semibold, fontSize: 12, color: c.text },
  topBar: { position: 'absolute', left: 0, right: 0, height: 44, justifyContent: 'center' },
  logo: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  deleteBtn: { position: 'absolute', right: 8, height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  deleteText: { fontFamily: FONT.semibold, fontSize: 15, color: c.text2 },
  result: { marginTop: 10, paddingHorizontal: 24, alignItems: 'center' },
  date: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, color: c.text2 },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  distance: { fontFamily: FONT.num, fontSize: 80, lineHeight: 90, color: c.text, fontVariant: ['tabular-nums'] },
  distanceUnit: { fontFamily: FONT.num, fontSize: 20, color: c.text2 },
  grid: {
    marginTop: 12, alignSelf: 'stretch', flexDirection: 'row',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.border,
  },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: c.border },
  label: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  cellValue: { fontFamily: FONT.num, fontSize: 26, lineHeight: 34, color: c.text, fontVariant: ['tabular-nums'] },
  cellUnit: { fontFamily: FONT.num, fontSize: 13, color: c.text2 },
  form: { marginTop: 24, paddingHorizontal: 24, gap: 24 },
  input: {
    height: 46, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.input, color: c.text, fontFamily: FONT.regular, fontSize: 15,
  },
  help: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  footer: { paddingHorizontal: 24, paddingTop: 8, backgroundColor: c.bg },
  saveBtn: { height: 54, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 35 },
  dialog: { alignSelf: 'stretch', paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20, borderRadius: 20, backgroundColor: c.surface, gap: 8 },
  dialogTitle: { fontFamily: FONT.semibold, fontSize: 18, lineHeight: 26, color: c.text },
  dialogBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2 },
  dialogActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  dialogKeep: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  dialogKeepText: { fontFamily: FONT.semibold, fontSize: 15, color: c.text },
  dialogDelete: { flex: 1, height: 48, borderRadius: 12, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' },
  dialogDeleteText: { fontFamily: FONT.semibold, fontSize: 15, color: '#FFFFFF' },
});
