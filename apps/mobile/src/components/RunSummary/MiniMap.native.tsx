import { useState } from 'react';
import { View, Text, LayoutChangeEvent } from 'react-native';

interface Props {
  coordinates: [number, number][];
}

const H = 160;
const PAD = 18;

function buildPath(coords: [number, number][], w: number, h: number) {
  if (coords.length < 2) return [];
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const rangeX = maxLng - minLng || 0.001;
  const rangeY = maxLat - minLat || 0.001;

  const drawW = w - PAD * 2;
  const drawH = h - PAD * 2;
  const scale = Math.min(drawW / rangeX, drawH / rangeY);
  const offsetX = PAD + (drawW - rangeX * scale) / 2;
  const offsetY = PAD + (drawH - rangeY * scale) / 2;

  return coords.map(([lng, lat]) => ({
    x: offsetX + (lng - minLng) * scale,
    y: offsetY + rangeY * scale - (lat - minLat) * scale,
  }));
}

export function MiniMap({ coordinates }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pts = width > 0 ? buildPath(coordinates, width, H) : [];

  if (coordinates.length < 2) {
    return (
      <View
        onLayout={onLayout}
        style={{ width: '100%', height: H, borderRadius: 20, backgroundColor: '#141414', borderWidth: 1, borderColor: '#1F1F1F', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#404040', fontSize: 13 }}>경로 데이터 없음</Text>
      </View>
    );
  }

  return (
    <View
      onLayout={onLayout}
      style={{ width: '100%', height: H, borderRadius: 20, backgroundColor: '#141414', borderWidth: 1, borderColor: '#1F1F1F', overflow: 'hidden' }}
    >
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
              backgroundColor: '#B3E5FC',
              borderRadius: 2,
              shadowColor: '#B3E5FC',
              shadowOpacity: 0.8,
              shadowRadius: 4,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: 'left center',
            }}
          />
        );
      })}
      {pts.length > 0 && (
        <>
          <View style={{
            position: 'absolute', left: pts[0].x - 6, top: pts[0].y - 6,
            width: 12, height: 12, borderRadius: 6,
            backgroundColor: '#0A0A0A', borderWidth: 2, borderColor: '#B3E5FC',
          }} />
          <View style={{
            position: 'absolute', left: pts[pts.length - 1].x - 5, top: pts[pts.length - 1].y - 5,
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: '#B3E5FC',
            shadowColor: '#B3E5FC', shadowOpacity: 0.9, shadowRadius: 6,
          }} />
        </>
      )}
    </View>
  );
}
