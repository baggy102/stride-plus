import { useLocalSearchParams } from 'expo-router';
import { ProfileMapScreen } from '@/components/ProfileMapScreen';

export default function ProfileScreen() {
  // filed: 방금 저장한 러닝 ID(요약 → 앨범 File 전환)
  const { filed } = useLocalSearchParams<{ filed?: string }>();
  return <ProfileMapScreen filedRunId={filed} />;
}
