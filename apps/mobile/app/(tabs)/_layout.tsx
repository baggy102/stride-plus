import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/FloatingTabBar';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="record" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
