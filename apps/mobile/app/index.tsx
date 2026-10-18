import { View, ActivityIndicator } from 'react-native';
import { useColors } from '@/theme/useColors';

export default function Index() {
  const c = useColors();
  return (
    <View className="flex-1 items-center justify-center bg-brand-dark">
      <ActivityIndicator size="large" color={c.value} />
    </View>
  );
}
