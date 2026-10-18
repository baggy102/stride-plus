import { Stack, useLocalSearchParams } from 'expo-router';
import { ProfileMapScreen } from '@/components/ProfileMapScreen';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      {/* S09 헤더(뒤로·워드마크·사용자 메뉴)는 ProfileMapScreen이 그린다 */}
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileMapScreen userId={id} />
    </>
  );
}
