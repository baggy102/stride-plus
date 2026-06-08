import { View, Text } from 'react-native';

interface Props {
  coordinates: [number, number][];
}

const W = 300;
const H = 140;
const PAD = 16;

function buildPath(coords: [number, number][]) {
  if (coords.length < 2) return [];
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const rangeX = maxLng - minLng || 0.001;
  const rangeY = maxLat - minLat || 0.001;

  const drawW = W - PAD * 2;
  const drawH = H - PAD * 2;
  const scale = Math.min(drawW / rangeX, drawH / rangeY);
  const offsetX = PAD + (drawW - rangeX * scale) / 2;
  const offsetY = PAD + (drawH - rangeY * scale) / 2;

  return coords.map(([lng, lat]) => ({
    x: offsetX + (lng - minLng) * scale,
    y: offsetY + rangeY * scale - (lat - minLat) * scale,
  }));
}

export function MiniMap({ coordinates }: Props) {
  const pts = buildPath(coordinates);

  if (pts.length < 2) {
    return (
      <View
        style={{ width: '100%', height: H, borderRadius: 16, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#71717a', fontSize: 14 }}>경로 데이터 없음</Text>
      </View>
    );
  }

  return (
    <View style={{ width: '100%', height: H, borderRadius: 16, backgroundColor: '#18181b', overflow: 'hidden' }}>
      {pts.slice(0, -1).map((a, i) => {
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: a.x,
              top: a.y - 1.5,
              width: len,
              height: 3,
              backgroundColor: '#3b82f6',
              borderRadius: 2,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: 'left center',
            }}
          />
        );
      })}
      <View style={{ position: 'absolute', left: pts[0].x - 5, top: pts[0].y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' }} />
      <View style={{ position: 'absolute', left: pts[pts.length - 1].x - 5, top: pts[pts.length - 1].y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' }} />
    </View>
  );
}
