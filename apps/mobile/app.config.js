// app.json을 그대로 쓰고, .env.local 값만 extra로 넘긴다.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? config.extra.apiUrl,
    cartoKey: process.env.EXPO_PUBLIC_CARTO_KEY,
  },
});
