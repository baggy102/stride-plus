// app.json을 그대로 쓰고, .env.local의 개발용 키만 extra로 넘긴다.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    cartoKey: process.env.EXPO_PUBLIC_CARTO_KEY,
  },
});
