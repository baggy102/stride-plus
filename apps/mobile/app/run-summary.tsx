import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, TextInput, Modal,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Dimensions,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRunStore } from '@/store/run';
import client from '@/api/client';
import { RouteBlueprint } from '@/components/RouteBlueprint';
import { CoordLine } from '@/components/Telemetry';
import { PhotoPicker } from '@/components/RunSummary/PhotoPicker';
import { generateRouteImage } from '@/components/RunSummary/generateRouteImage';
import { useColors } from '@/theme/useColors';
import { FONT, monoLabel } from '@/theme/fonts';
import { withAlpha, type Palette } from '@/theme/colors';
import { formatDuration, formatPace } from '@/utils/pace';
import { formatClock, formatDay } from '@/utils/date';
import { kmSplits } from '@/utils/route';

// 시작점의 동네 이름(「여의도 한강공원」처럼). 못 찾으면 null
async function placeName([lng, lat]: [number, number]): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return place?.name || place?.district || place?.street || place?.city || null;
  } catch {
    return null;
  }
}

// Frost S07 러닝 요약 — 격자 도면(+1 km 눈금) · 좌표 · 거리 76px · TIME/PACE · km 스플릿 · 사진 · 코스 소개 · 저장, 삭제 확인
export default function RunSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(() => Dimensions.get('window').width);
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
  const [place, setPlace] = useState<string | null>(null);

  // 요약 데이터 없이 직접 진입한 경우(새로고침 등) 기록 탭으로 되돌림
  useEffect(() => {
    if (!pendingSummary) router.replace('/(tabs)/record');
  }, [pendingSummary, router]);

  const start = pendingSummary?.coordinates[0];
  useEffect(() => {
    if (start) placeName(start).then(setPlace);
  }, [start?.[0], start?.[1]]);

  const splits = useMemo(
    () => (pendingSummary ? kmSplits(pendingSummary.coordinates, pendingSummary.routeTimes) : []),
    [pendingSummary],
  );

  if (!pendingSummary) return null;
  const summary = pendingSummary;
  const boxWidth = width - 48;

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
      form.append('routeTimes', JSON.stringify(summary.routeTimes));
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
    <View style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {/* 머리: 「러닝 종료 · 10.16 목 · 07:05」 + 장소 */}
          <View style={styles.head}>
            <Text style={styles.kicker}>{`러닝 종료 · ${formatDay(finishedAt)} · ${formatClock(finishedAt)}`}</Text>
            <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>{place ?? '이번 러닝'}</Text>
          </View>

          {/* 경로 도면 */}
          <View style={styles.blueprint}>
            <RouteBlueprint coords={summary.coordinates} width={boxWidth} height={192} />
          </View>
          <View style={styles.coords}>
            <CoordLine at={start} />
          </View>

          {/* 러닝 결과 */}
          <View accessibilityLabel="러닝 결과" style={styles.result}>
            <View accessible accessibilityLabel={`거리 ${summary.distanceKm.toFixed(2)} km`} style={styles.distanceRow}>
              <Text style={styles.distance}>{summary.distanceKm.toFixed(2)}</Text>
              <Text style={styles.distanceUnit}>KM</Text>
            </View>
            <View style={styles.grid}>
              <View style={styles.cell}>
                <Text style={styles.cellLabel}>TIME</Text>
                <Text style={styles.cellValue}>{formatDuration(summary.elapsedSeconds)}</Text>
              </View>
              <View style={[styles.cell, styles.cellDivider]}>
                <Text style={styles.cellLabel}>PACE</Text>
                <Text style={styles.cellValue}>
                  {formatPace(summary.paceSecPerKm)}
                  <Text style={styles.cellUnit}> /KM</Text>
                </Text>
              </View>
            </View>
            {splits.length > 0 && <SplitBars splits={splits} c={c} styles={styles} />}
          </View>

          <View style={styles.form}>
            <PhotoPicker photos={photos} onChange={setPhotos} />

            <View style={{ gap: 4 }}>
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

      <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={[styles.deleteBtn, { top: insets.top - 2 }]}>
        <Text style={styles.deleteText}>삭제</Text>
      </Pressable>

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

// km별 페이스 막대: 빠를수록 높다(12~30px). 다 채운 km만
function SplitBars({ splits, c, styles }: { splits: number[]; c: Palette; styles: ReturnType<typeof makeStyles> }) {
  const min = Math.min(...splits);
  const max = Math.max(...splits);
  const label = `km별 페이스: ${splits.map((s, i) => `${i + 1}km ${formatPace(s)}`).join(', ')}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.splits}>
      <View style={styles.splitBars}>
        {splits.map((s, i) => (
          <LinearGradient
            key={i}
            colors={[c.value, withAlpha(c.value, c.dark ? 0.25 : 0.18)]}
            style={[styles.splitBar, { height: max === min ? 22 : Math.round(12 + (18 * (max - s)) / (max - min)) }]}
          />
        ))}
      </View>
      <View style={styles.splitLabels}>
        {splits.map((_, i) => (
          <Text key={i} style={styles.splitLabel}>{i + 1}</Text>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  head: { paddingHorizontal: 24, paddingRight: 86 },
  kicker: { ...monoLabel(12, 0.08), lineHeight: 18, color: c.text2 },
  title: { marginTop: 4, fontFamily: FONT.bold, fontSize: 20, lineHeight: 26, color: c.text },
  blueprint: { marginTop: 14, paddingHorizontal: 24 },
  coords: { marginTop: 4 },
  deleteBtn: { position: 'absolute', right: 8, height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  deleteText: { fontFamily: FONT.semibold, fontSize: 15, color: c.text2 },
  result: { marginTop: 8, paddingHorizontal: 24 },
  distanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  distance: { fontFamily: FONT.num, fontSize: 76, lineHeight: 80, letterSpacing: -1.5, color: c.text, fontVariant: ['tabular-nums'] },
  // 팔레트 토큰 이름이 value라 인라인 { color: c.value }는 reanimated 플러그인이 shared value로 오인해 경고한다 → StyleSheet로
  distanceUnit: { marginTop: 12, ...monoLabel(14), color: c.value },
  grid: { marginTop: 8, flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.hair },
  cell: { flex: 1, paddingVertical: 8 },
  cellDivider: { paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: c.hair },
  cellLabel: { ...monoLabel(11), lineHeight: 16, color: c.text2 },
  cellValue: { fontFamily: FONT.num, fontSize: 24, lineHeight: 30, color: c.text, fontVariant: ['tabular-nums'] },
  cellUnit: { ...monoLabel(11, 0.08), color: c.text2 },
  splits: { marginTop: 12 },
  splitBars: { height: 30, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  splitBar: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  splitLabels: { marginTop: 3, flexDirection: 'row', gap: 6 },
  splitLabel: { flex: 1, textAlign: 'center', ...monoLabel(10, 0), lineHeight: 12, color: c.text2 },
  label: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  form: { marginTop: 20, paddingHorizontal: 24, gap: 20 },
  input: {
    height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.input, color: c.text, fontFamily: FONT.regular, fontSize: 15,
  },
  help: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  footer: { paddingHorizontal: 24, paddingTop: 8, backgroundColor: c.bg },
  saveBtn: { height: 54, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 35 },
  dialog: {
    alignSelf: 'stretch', paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20, borderRadius: 20, backgroundColor: c.surface, gap: 8,
    borderTopWidth: 1, borderTopColor: c.hair,
  },
  dialogTitle: { fontFamily: FONT.semibold, fontSize: 18, lineHeight: 26, color: c.text },
  dialogBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2 },
  dialogActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  dialogKeep: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  dialogKeepText: { fontFamily: FONT.semibold, fontSize: 15, color: c.text },
  dialogDelete: { flex: 1, height: 48, borderRadius: 12, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' },
  dialogDeleteText: { fontFamily: FONT.semibold, fontSize: 15, color: '#FFFFFF' },
});
