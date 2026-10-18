import { Stack, useLocalSearchParams } from 'expo-router';
import { ProfileMapScreen } from '@/components/ProfileMapScreen';
import { useColors } from '@/theme/useColors';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();

  return (
    <>
      <Stack.Screen options={{ title: '프로필', headerTransparent: true, headerTintColor: c.text }} />
      <ProfileMapScreen userId={id} />
    </>
  );
}
