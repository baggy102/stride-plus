import { Stack, useLocalSearchParams } from 'expo-router';
import { ProfileMapScreen } from '@/components/ProfileMapScreen';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: '프로필', headerTransparent: true, headerTintColor: '#18181b' }} />
      <ProfileMapScreen userId={id} />
    </>
  );
}
