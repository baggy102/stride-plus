import Constants from 'expo-constants';

// 지도 벡터 타일 URL 템플릿 — 설정값 하나(.env.local EXPO_PUBLIC_MAP_TILE_URL, app.config.js extra.mapTileUrl).
// 개발: Protomaps API(비상업 무료, 키 포함). 운영: 한국 영역 PMTiles 자체 호스팅 URL로 이 값만 바꾼다(F6).
export const MAP_TILE_URL = (Constants.expoConfig?.extra?.mapTileUrl as string | undefined) ?? '';
