import { View, Text, Pressable, Image, Alert } from 'react-native';
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
      <Text className="text-zinc-400 text-sm mb-2">사진 ({photos.length}/3)</Text>
      <View className="flex-row gap-2">
        {photos.map((uri, i) => (
          <View key={i} className="relative">
            <Image source={{ uri }} className="w-20 h-20 rounded-xl" />
            <Pressable
              onPress={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute -top-1 -right-1 bg-zinc-700 rounded-full w-5 h-5 items-center justify-center"
            >
              <Text className="text-white text-xs leading-none">✕</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < 3 && (
          <Pressable
            onPress={pick}
            className="w-20 h-20 rounded-xl border border-dashed border-zinc-600 items-center justify-center active:opacity-60"
          >
            <Text className="text-zinc-400 text-2xl">+</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
