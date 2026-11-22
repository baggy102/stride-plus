import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocateIcon } from './icons';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';

// 확정 UI S15 위치 권한 설명(추가 화면 ①): 시스템 권한 창 전에 화면이 꺼져도 기록이 이어진다는 것을 알려 준다.
// 「사용하는 동안」 권한만으로도 기록이 이어져서(src/store/run.ts startBackgroundUpdates) 「항상 허용」은 안내하지 않는다(Q3 제안안, 2026-11-22)
interface Props {
  visible: boolean;
  onContinue: () => void;
  onLater: () => void;
}

export function LocationPermissionSheet({ visible, onContinue, onLater }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onLater}>
      <View style={[styles.scrim, { backgroundColor: c.scrim }]}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, 24) + 10 }]}
        >
          <View style={[styles.handle, { backgroundColor: c.text2 }]} />
          <View style={[styles.icon, { backgroundColor: c.accent }]}>
            <LocateIcon color={c.ink} size={26} />
          </View>
          <Text style={[styles.title, { color: c.text }]}>화면이 꺼져도 경로가 이어지게</Text>
          <Text style={[styles.body, { color: c.text2 }]}>
            달리는 동안 화면이 꺼져도 경로를 이어서 기록해요. 다음 창에서 위치 권한을 허용해 주세요.
          </Text>
          <View style={[styles.steps, { backgroundColor: c.surface2 }]}>
            <Text style={[styles.step, { color: c.text }]}>
              1. 다음 창에서 <Text style={styles.strong}>앱을 사용하는 동안 허용</Text>을 골라 주세요.
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onContinue} style={[styles.primary, { backgroundColor: c.accent }]}>
            <Text style={[styles.primaryText, { color: c.ink }]}>계속</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onLater} style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: c.text2 }]}>나중에</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingTop: 10, paddingHorizontal: 24, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 14 },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, opacity: 0.6 },
  icon: { marginTop: 8, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT.semibold, fontSize: 20, lineHeight: 30 },
  body: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23 },
  steps: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, gap: 8 },
  step: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22 },
  strong: { fontFamily: FONT.bold },
  primary: { marginTop: 10, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: FONT.semibold, fontSize: 16 },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: FONT.semibold, fontSize: 15 },
});
