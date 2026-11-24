// 지도 피드 마커의 남에게 보이는 시작점(startPublic) = 집 근처를 자른 경로(trimHomeEnds)의 첫 점.
// 200m 이하 경로는 가운데 한 점, 빈 경로는 null. 저장할 때 미리 계산해 두고 마커 검색($near)과 응답에 쓴다.
// 원래 시작점은 따로 저장하지 않는다(집 근처 한 점이 그대로 남는다). 본인 마커는 그때그때 경로의 첫 점을 읽는다(runs.service.ts)
// 백필 스크립트(scripts/backfill-start-public.js)도 빌드된 이 파일을 써서 서버와 같은 값을 채운다
import { trimHomeEnds } from './home-privacy';

type LngLat = [number, number];

export interface GeoPoint {
  type: 'Point';
  coordinates: LngLat;
}

export function startPublic(coordinates: LngLat[]): GeoPoint | null {
  const first = trimHomeEnds(coordinates).coordinates[0];
  return first ? { type: 'Point', coordinates: [first[0], first[1]] } : null;
}

// startPublic이 아직 없는 문서만 채우는 bulkWrite 한 건. 여러 번 실행해도 결과가 같다(이미 채운 문서는 건드리지 않는다).
// 서버가 읽으며 채울 때와 백필 스크립트가 같이 쓴다
export function startPublicUpdate(id: unknown, coordinates: LngLat[]) {
  return {
    updateOne: {
      filter: { _id: id, startPublic: { $exists: false } },
      update: { $set: { startPublic: startPublic(coordinates) } },
    },
  };
}
