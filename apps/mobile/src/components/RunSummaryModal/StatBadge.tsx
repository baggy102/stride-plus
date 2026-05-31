import { View, Text } from 'react-native';

interface Props {
  distanceKm: number;
  paceSecPerKm: number;
  elapsedSeconds: number;
}

function formatPace(sec: number) {
  if (sec === 0) return "--'--\"";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function StatBadge({ distanceKm, paceSecPerKm, elapsedSeconds }: Props) {
  return (
    <View className="flex-row justify-around py-4 bg-zinc-800 rounded-2xl">
      <Stat label="거리" value={`${distanceKm.toFixed(2)}`} unit="km" />
      <View className="w-px bg-zinc-700" />
      <Stat label="페이스" value={formatPace(paceSecPerKm)} unit="/km" />
      <View className="w-px bg-zinc-700" />
      <Stat label="시간" value={formatTime(elapsedSeconds)} unit="" />
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View className="items-center flex-1">
      <Text className="text-zinc-400 text-xs uppercase tracking-widest mb-1">{label}</Text>
      <Text className="text-white text-xl font-bold tabular-nums">{value}</Text>
      {!!unit && <Text className="text-zinc-500 text-xs">{unit}</Text>}
    </View>
  );
}
