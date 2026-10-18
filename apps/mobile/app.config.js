// app.json을 그대로 쓰고, .env.local 값만 extra로 넘긴다.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? config.extra.apiUrl,
    // 지도 벡터 타일 URL 템플릿(D3) — .env.local 전용, 운영은 F6 PMTiles URL
    mapTileUrl: process.env.EXPO_PUBLIC_MAP_TILE_URL,
  },
});
