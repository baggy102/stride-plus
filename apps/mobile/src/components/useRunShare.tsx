import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ShareCard, type ShareCardData } from '@/components/ShareCard';
import { routeGeometry, type LngLat } from '@/utils/route';
import { evenPoints, firstRunFlags, FIRST_RUN_MIN_KM, mostFrequent } from '@/utils/shareRun';

export interface RunShareInput {
  /** 원래 경로(출발·도착 100m는 여기서 자른다) */
  route: LngLat[];
  /** 「처음 달린 길」 판정에 쓸 내 이전 러닝 경로들 */
  previous: LngLat[][];
  distanceKm: number;
  paceSecPerKm: number;
  createdAt: string;
}

/**
 * 러닝 공유(2026-11-21): 공유 이미지 재료를 구하고(출발·도착 100m 자름 · 처음 달린 구간 · 경로 위 다섯 점 중 가장 많이 나온 동),
 * 화면 밖에 ShareCard를 그려 1080×1920으로 캡처한 뒤 시스템 공유 시트를 띄운다.
 * node는 화면 어딘가에 그려 둬야 한다(캡처할 때만 화면 밖에 나타난다)
 */
export function useRunShare(): { sharing: boolean; share: (input: RunShareInput) => Promise<void>; node: ReactNode } {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [data, setData] = useState<ShareCardData | null>(null);
  const [sharing, setSharing] = useState(false);

  const share = useCallback(async (input: RunShareInput) => {
    if (sharing) return;
    setSharing(true);
    try {
      const main = routeGeometry(input.route, true).main;
      const { first, km } = firstRunFlags(main, input.previous);
      const names = await Promise.all(evenPoints(main, 5).map(async ([lng, lat]) => {
        try {
          const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          return place?.district ?? null;
        } catch {
          return null;
        }
      }));
      setData({
        route: main, first, firstKm: km >= FIRST_RUN_MIN_KM ? km : 0, place: mostFrequent(names),
        distanceKm: input.distanceKm, paceSecPerKm: input.paceSecPerKm, createdAt: input.createdAt,
      });
    } catch {
      setSharing(false);
    }
  }, [sharing]);

  // 화면 밖에 그린 다음 프레임에 캡처 → 공유 시트. 실패해도 다시 누를 수 있게 상태만 되돌린다
  useEffect(() => {
    if (!data) return;
    const frame = requestAnimationFrame(async () => {
      try {
        const uri = await captureRef(ref, { format: 'png', width: 1080, height: 1920, result: 'tmpfile' });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
      } catch {
        // 캡처·공유 실패
      } finally {
        setData(null);
        setSharing(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [data]);

  const node = data ? (
    <View style={styles.offscreen} pointerEvents="none">
      <ShareCard ref={ref} data={data} />
    </View>
  ) : null;
  return { sharing, share, node };
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
