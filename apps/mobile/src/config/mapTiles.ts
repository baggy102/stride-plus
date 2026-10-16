import Constants from 'expo-constants';

// 개발용 CARTO 타일. 운영은 Phase 4 D3(protomaps)에서 교체한다.
const CARTO_KEY = (Constants.expoConfig?.extra?.cartoKey as string | undefined) ?? '';

export const CARTO_TILE_URL = `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`;
export const CARTO_ATTRIBUTION = '© OpenStreetMap contributors © CARTO';
