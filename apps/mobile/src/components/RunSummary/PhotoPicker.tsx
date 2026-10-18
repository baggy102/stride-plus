import { useMemo } from 'react';
import { View, Text, Pressable, Image, Alert, Linking, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import { PlusIcon, CloseIcon } from '../icons';
import type { Palette } from '@/theme/colors';

interface Props {
  photos: string[];
  onChange: (photos: string[]) => void;
}

export function PhotoPicker({ photos, onChange }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      // 거부해도 기록 저장은 계속할 수 있다. 사진만 못 붙인다
      Alert.alert(
        '사진 접근이 꺼져 있어요',
        '러닝 기록에 사진을 붙이려면 설정에서 사진 접근을 허용해 주세요.',
        [
          { text: '나중에', style: 'cancel' },
          { text: '설정 열기', onPress: () => { Linking.openSettings(); } },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 3 - photos.length,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      onChange([...photos, ...uris].slice(0, 3));
    }
  };

  return (
    <View>
      {/* 확정 UI S07: 「사진 n/3」, 56px 썸네일·추가 버튼 */}
      <View style={styles.header}>
        <Text style={styles.label}>사진</Text>
        <Text style={styles.label}>{photos.length}/3</Text>
      </View>
      <View style={styles.row}>
        {photos.map((uri, i) => (
          <View key={i} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="사진 빼기"
              onPress={() => onChange(photos.filter((_, j) => j !== i))}
              style={styles.removeBtn}
            >
              <CloseIcon size={12} color={c.text} />
            </Pressable>
          </View>
        ))}
        {photos.length < 3 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 추가"
            onPress={pick}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <PlusIcon color={c.text} />
            <Text style={styles.addText}>추가</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  row: { flexDirection: 'row', gap: 10 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 56, height: 56, borderRadius: 14 },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: c.surface, borderColor: c.border, borderWidth: 1,
    borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 56, height: 56, borderColor: c.border, borderWidth: 1, backgroundColor: c.input,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 1,
  },
  addText: { fontFamily: FONT.semibold, fontSize: 11, color: c.text },
});
