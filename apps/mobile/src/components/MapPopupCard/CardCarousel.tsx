import { useState } from 'react';
import { View, Image, ScrollView } from 'react-native';

interface Props {
  imgs: string[];
  baseUrl: string;
}

export function CardCarousel({ imgs, baseUrl }: Props) {
  const [idx, setIdx] = useState(0);
  const [w, setW] = useState(0);

  if (imgs.length === 0) return null;

  return (
    <View
      style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {w > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          scrollEventThrottle={16}
          style={{ width: w, height: 130 }}
          onScroll={(e) =>
            setIdx(Math.round(e.nativeEvent.contentOffset.x / w))
          }
        >
          {imgs.map((uri, i) => (
            <Image
              key={i}
              source={{ uri: `${baseUrl}${uri}` }}
              style={{ width: w, height: 130 }}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      )}
      {imgs.length > 1 && w > 0 && (
        <View style={{ position: 'absolute', bottom: 6, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          {imgs.map((_, i) => (
            <View
              key={i}
              style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
