import { View, Text, Pressable, Image, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface Props {
  photos: string[];
  onChange: (photos: string[]) => void;
}

export function PhotoPicker({ photos, onChange }: Props) {
  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
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
      <Text style={styles.label}>
        사진 ({photos.length}/3)
      </Text>
      <View style={styles.row}>
        {photos.map((uri, i) => (
          <View key={i} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} />
            <Pressable
              onPress={() => onChange(photos.filter((_, j) => j !== i))}
              style={styles.removeBtn}
            >
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < 3 && (
          <Pressable
            onPress={pick}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={styles.addText}>+</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: '#808080', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 84, height: 84, borderRadius: 16 },
  removeBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#141414', borderColor: '#1F1F1F', borderWidth: 1,
    borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  removeText: { color: '#F5F5F5', fontSize: 12, lineHeight: 12 },
  addBtn: {
    width: 84, height: 84, borderColor: '#1F1F1F', borderWidth: 1, borderStyle: 'dashed',
    borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  addText: { color: '#B3E5FC', fontSize: 24 },
});
