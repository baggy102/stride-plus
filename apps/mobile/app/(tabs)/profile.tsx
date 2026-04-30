import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';

export default function ProfileScreen() {
  const { user, clearAuth } = useAuthStore();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 p-6">
        <Text className="text-2xl font-bold mb-2">프로필</Text>
        <Text className="text-gray-600 mb-1">{user?.nickname ?? ''}</Text>
        <Text className="text-gray-400 text-sm mb-8">{user?.email ?? ''}</Text>
        <Pressable
          className="border border-gray-300 rounded-lg py-3 items-center"
          onPress={clearAuth}
        >
          <Text className="text-gray-600">로그아웃</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
