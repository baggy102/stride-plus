import { View, Text } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ title: '러닝 상세' }} />
      <View className="flex-1 p-6">
        <Text className="text-2xl font-bold mb-4">러닝 상세</Text>
        <Text className="text-gray-500">Run ID: {id}</Text>
      </View>
    </SafeAreaView>
  );
}
