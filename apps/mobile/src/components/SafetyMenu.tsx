import { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import client from '@/api/client';
import { CheckIcon, MoreIcon } from '@/components/icons';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';

// 서버 Report.reason enum(C1)과 같은 값
const REPORT_REASONS = [
  { value: 'spam', label: '스팸·광고' },
  { value: 'inappropriate', label: '부적절한 사진·내용' },
  { value: 'harassment', label: '욕설·괴롭힘' },
  { value: 'other', label: '기타' },
] as const;

type Reason = (typeof REPORT_REASONS)[number]['value'];
type Sheet = 'none' | 'menu' | 'report' | 'reported' | 'block';

interface Props {
  /** 신고 대상 — 러닝 상세는 run, 사용자 프로필은 user */
  targetType: 'run' | 'user';
  targetId: string;
  author: { id: string; username: string };
  /** 차단에 성공한 뒤 — 상세는 피드로, 프로필은 차단 상태로 */
  onBlocked: () => void;
  /** 메뉴 접근성 이름(캔버스: 러닝 메뉴 / 사용자 메뉴) */
  label: string;
}

// 확정 UI S13 신고·차단 — ⋯ 버튼, 메뉴, 신고 사유 시트, 접수 안내, 차단 확인
export function SafetyMenu({ targetType, targetId, author, onBlocked, label }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>('none');
  const [reason, setReason] = useState<Reason | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = (next: Sheet) => { setFailed(false); setSheet(next); };
  const close = () => {
    if (busy) return;
    setSheet('none');
    setReason(null);
    setFailed(false);
  };

  const sendReport = async () => {
    if (!reason) return;
    setBusy(true);
    setFailed(false);
    try {
      await client.post('/reports', { targetType, targetId, reason });
      setSheet('reported');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await client.post(`/users/${author.id}/block`);
      setBusy(false);
      setSheet('none');
      onBlocked();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  const failedText = failed ? <Text style={styles.failed}>요청하지 못했어요. 다시 시도해 주세요.</Text> : null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: sheet === 'menu' }}
        onPress={() => open('menu')}
        style={styles.trigger}
      >
        <MoreIcon color={c.text} />
      </Pressable>

      <Modal transparent visible={sheet !== 'none'} animationType="fade" onRequestClose={close}>
        <Pressable
          accessibilityLabel="닫기"
          onPress={close}
          style={[StyleSheet.absoluteFill, sheet !== 'menu' && { backgroundColor: c.scrim }]}
        />

        {sheet === 'menu' && (
          <View accessibilityRole="menu" accessibilityLabel={label} style={[styles.menu, { top: insets.top + 52 }]}>
            <Pressable accessibilityRole="menuitem" onPress={() => open('report')} style={styles.menuItem}>
              <Text style={styles.menuText}>신고하기</Text>
            </Pressable>
            <Pressable accessibilityRole="menuitem" onPress={() => open('block')} style={styles.menuItem}>
              <Text style={styles.menuDanger}>사용자 차단</Text>
            </Pressable>
          </View>
        )}

        {sheet === 'report' && (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>신고 사유를 선택해 주세요</Text>
            <View accessibilityRole="radiogroup">
              {REPORT_REASONS.map((item) => {
                const on = reason === item.value;
                return (
                  <Pressable
                    key={item.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setReason(item.value)}
                    style={styles.reasonRow}
                  >
                    <View style={[styles.radio, { borderWidth: on ? 7 : 2, borderColor: on ? c.value : c.text2 }]} />
                    <Text style={styles.reasonText}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {failedText}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !reason || busy }}
              disabled={!reason || busy}
              onPress={sendReport}
              style={[styles.sheetBtn, { backgroundColor: reason ? c.accent : c.surface2 }]}
            >
              {busy ? <ActivityIndicator color={c.ink} /> : (
                <Text style={[styles.sheetBtnText, { color: reason ? c.ink : c.muted }]}>신고하기</Text>
              )}
            </Pressable>
          </View>
        )}

        {sheet === 'reported' && (
          <View style={[styles.sheet, styles.reportedSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.handle} />
            <View style={styles.doneIcon}>
              <CheckIcon size={30} color={c.ink} />
            </View>
            <Text style={styles.sheetTitle}>신고가 접수되었어요</Text>
            <Text style={styles.body}>검토한 뒤 필요한 조치를 할게요.</Text>
            <Pressable accessibilityRole="button" onPress={close} style={[styles.sheetBtn, styles.fullWidth, { backgroundColor: c.accent }]}>
              <Text style={[styles.sheetBtnText, { color: c.ink }]}>확인</Text>
            </Pressable>
          </View>
        )}

        {sheet === 'block' && (
          <View style={styles.dialogWrap} pointerEvents="box-none">
            <View accessibilityRole="alert" style={styles.dialog}>
              <Text style={styles.sheetTitle}>{author.username || '이 사용자'} 님을 차단할까요?</Text>
              <Text style={styles.bodyStrong}>이 사용자의 러닝이 더 이상 보이지 않습니다.</Text>
              {failedText}
              <View style={styles.dialogButtons}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={[styles.pill, { backgroundColor: c.surface2 }]}>
                  <Text style={[styles.sheetBtnText, { color: c.text }]}>취소</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={block} style={[styles.pill, { backgroundColor: c.danger }]}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.sheetBtnText, { color: '#FFFFFF' }]}>차단</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  trigger: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute', right: 16, width: 200, padding: 6, borderRadius: 16,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    shadowColor: c.shadow, shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  menuItem: { height: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  menuText: { fontFamily: FONT.regular, fontSize: 16, color: c.text },
  menuDanger: { fontFamily: FONT.semibold, fontSize: 16, color: c.danger },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 20,
    borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: c.surface, gap: 12,
  },
  reportedSheet: { alignItems: 'center', gap: 10 },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: c.text2, opacity: 0.6 },
  sheetTitle: { marginTop: 6, fontFamily: FONT.semibold, fontSize: 18, lineHeight: 26, color: c.text },
  reasonRow: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: c.border },
  radio: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.surface },
  reasonText: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 22, color: c.text },
  failed: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.danger },
  sheetBtn: { marginTop: 8, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch', marginTop: 18 },
  sheetBtnText: { fontFamily: FONT.semibold, fontSize: 16 },
  doneIcon: {
    marginTop: 14, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2, textAlign: 'center' },
  bodyStrong: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text },
  dialogWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  dialog: {
    paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20, borderRadius: 22, backgroundColor: c.surface, gap: 10,
    shadowColor: c.shadow, shadowOpacity: 0.45, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  dialogButtons: { marginTop: 12, flexDirection: 'row', gap: 10 },
  pill: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
