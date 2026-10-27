import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { useThemeStore, type ThemeMode } from '@/store/theme';
import { BackIcon, CheckIcon, ChevronIcon } from '@/components/icons';
import { LEGAL_DOCS, SUPPORT_EMAIL } from '@/config/legal';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';

// 계정 삭제 시 함께 지워지는 항목(서버 UsersService.deleteAccount와 맞춘다)
const DELETED_ITEMS = ['계정 정보', '러닝 기록', '게시글', '사진'];
// 위치기반서비스 이용약관은 설정에서 캔버스 표기를 따른다
const SETTINGS_LEGAL_LABELS: Record<string, string> = { location: '위치기반서비스 이용약관' };

type Dialog = 'none' | 'legal' | 'delete';

const THEME_MODES: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: '시스템 설정' },
  { mode: 'light', label: '라이트' },
  { mode: 'dark', label: '다크' },
];

// 확정 UI S11 설정(+ 화면 테마 선택, Frost) · S12 계정 삭제 확인 · S14 약관 준비 중 안내
export default function SettingsScreen() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, deleteAccount } = useAuthStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const [dialog, setDialog] = useState<Dialog>('none');
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));

  const closeDialog = () => {
    if (deleting) return;
    setDialog('none');
    setDeleteFailed(false);
  };

  // 성공하면 인증 상태가 풀려 _layout이 로그인 화면으로 보낸다
  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteAccount();
    } catch {
      setDeleteFailed(true);
      setDeleting(false);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={goBack} style={styles.iconBtn}>
          <BackIcon size={24} color={c.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>설정</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>계정</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>이메일</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{user?.email ?? ''}</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionGap]}>화면 테마</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="화면 테마" style={styles.group}>
          {THEME_MODES.map((option, index) => {
            const selected = option.mode === themeMode;
            return (
              <Pressable
                key={option.mode}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setThemeMode(option.mode)}
                style={[styles.row, styles.linkRow, index > 0 && styles.rowDivider]}
              >
                <Text style={styles.rowLabel}>{option.label}</Text>
                {selected && <CheckIcon size={22} color={c.value} />}
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionGap]}>약관 및 정책</Text>
        <View style={styles.group}>
          {LEGAL_DOCS.map((doc, index) => (
            <Pressable
              key={doc.key}
              accessibilityRole="button"
              onPress={() => setDialog('legal')}
              style={[styles.row, styles.linkRow, index > 0 && styles.rowDivider]}
            >
              <Text style={styles.rowLabel}>{SETTINGS_LEGAL_LABELS[doc.key] ?? doc.label}</Text>
              <ChevronIcon color={c.text2} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionGap]}>문의</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>운영자 연락처</Text>
            <Text selectable style={styles.rowValue}>{SUPPORT_EMAIL}</Text>
          </View>
        </View>

        <View style={[styles.group, styles.blockGap]}>
          <Pressable accessibilityRole="button" onPress={logout} style={styles.row}>
            <Text style={styles.rowLabel}>로그아웃</Text>
          </Pressable>
        </View>

        <View style={[styles.group, styles.blockGap]}>
          <Pressable accessibilityRole="button" onPress={() => setDialog('delete')} style={styles.row}>
            <Text style={styles.deleteLabel}>계정 삭제</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal transparent visible={dialog !== 'none'} animationType="fade" onRequestClose={closeDialog}>
        <Pressable accessibilityLabel="닫기" style={styles.scrim} onPress={closeDialog} />
        <View style={styles.dialogWrap} pointerEvents="box-none">
          {dialog === 'legal' && (
            <View accessibilityRole="alert" style={styles.dialog}>
              <Text style={styles.dialogTitle}>약관 페이지 준비 중입니다</Text>
              <Text style={styles.dialogBody}>공개 페이지가 열리면 여기서 바로 볼 수 있어요.</Text>
              <Pressable accessibilityRole="button" onPress={closeDialog} style={[styles.pill, styles.pillAccent, { marginTop: 10 }]}>
                <Text style={styles.pillAccentText}>확인</Text>
              </Pressable>
            </View>
          )}
          {dialog === 'delete' && (
            <View style={styles.dialog}>
              <Text style={styles.dialogTitle}>계정을 삭제할까요?</Text>
              <Text style={styles.dialogText}>아래 항목이 모두 삭제됩니다.</Text>
              <View style={styles.deletedList}>
                {DELETED_ITEMS.map((item) => (
                  <Text key={item} style={styles.dialogText}>{`•  ${item}`}</Text>
                ))}
              </View>
              <Text style={styles.irreversible}>삭제한 뒤에는 되돌릴 수 없습니다.</Text>
              {deleteFailed && <Text style={styles.dialogBody}>삭제하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.</Text>}
              <View style={styles.dialogButtons}>
                <Pressable accessibilityRole="button" disabled={deleting} onPress={closeDialog} style={[styles.pill, styles.pillNeutral]}>
                  <Text style={styles.pillNeutralText}>취소</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={deleting} onPress={confirmDelete} style={[styles.pill, styles.pillDanger]}>
                  {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.pillDangerText}>계정 삭제</Text>}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 8, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22, color: c.text },
  body: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  sectionTitle: { paddingHorizontal: 4, fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  sectionGap: { marginTop: 12 },
  blockGap: { marginTop: 20 },
  group: { borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  row: { height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  linkRow: { paddingRight: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
  rowLabel: { fontFamily: FONT.regular, fontSize: 16, color: c.text },
  rowValue: { flexShrink: 1, fontFamily: FONT.regular, fontSize: 16, color: c.text2 },
  deleteLabel: { fontFamily: FONT.semibold, fontSize: 16, color: c.danger },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: c.scrim },
  dialogWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  dialog: {
    paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20, borderRadius: 22, backgroundColor: c.surface, gap: 14,
    shadowColor: c.shadow, shadowOpacity: 0.45, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  dialogTitle: { fontFamily: FONT.semibold, fontSize: 18, lineHeight: 26, color: c.text },
  dialogText: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text },
  dialogBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2 },
  deletedList: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.surface2, gap: 4 },
  irreversible: { fontFamily: FONT.semibold, fontSize: 15, lineHeight: 22, color: c.danger },
  dialogButtons: { marginTop: 6, flexDirection: 'row', gap: 10 },
  pill: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  pillAccent: { flex: 0, backgroundColor: c.accent },
  pillAccentText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
  pillNeutral: { backgroundColor: c.surface2 },
  pillNeutralText: { fontFamily: FONT.semibold, fontSize: 16, color: c.text },
  pillDanger: { backgroundColor: c.danger },
  pillDangerText: { fontFamily: FONT.semibold, fontSize: 16, color: '#FFFFFF' },
});
