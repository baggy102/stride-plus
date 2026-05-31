/**
 * 용인시 기준 더미 러닝 데이터 10개 삽입
 * 사용법: node scripts/seed-runs.js [userId]
 *         userId 생략 시 DB에서 첫 번째 유저에게 삽입
 */
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stride-plus';

const RunSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    route: {
      type: { type: String, enum: ['LineString'] },
      coordinates: [[Number]],
    },
    distanceKm: Number,
    paceSecPerKm: Number,
    photoUrls: [String],
    description: String,
  },
  { timestamps: true },
);
RunSchema.index({ route: '2dsphere' });

const UserSchema = new mongoose.Schema({}, { strict: false });

// 시작점에서 방향/step 수를 받아 좌표 배열 생성
// stepLng/Lat: 약 0.001° ≈ 100m
function makeRoute(startLng, startLat, stepLng, stepLat, steps) {
  const coords = [];
  let lng = startLng;
  let lat = startLat;
  for (let i = 0; i < steps; i++) {
    coords.push([
      parseFloat((lng + (Math.random() - 0.5) * 0.00015).toFixed(6)),
      parseFloat((lat + (Math.random() - 0.5) * 0.00015).toFixed(6)),
    ]);
    lng += stepLng;
    lat += stepLat;
  }
  return coords;
}

// 용인시 각 지역 러닝 코스 10개
const YONGIN_RUNS = [
  {
    label: '죽전 호수공원 코스',
    coords: makeRoute(127.1093, 37.3303, 0.0006, 0.0008, 45), // 4.5km NE
    distanceKm: 4.5,
    paceSecPerKm: 330,
  },
  {
    label: '보정동 코스',
    coords: makeRoute(127.1348, 37.2671, -0.0003, -0.001, 38), // 3.8km S
    distanceKm: 3.8,
    paceSecPerKm: 365,
  },
  {
    label: '기흥호수 코스',
    coords: makeRoute(127.1213, 37.2704, 0.0008, 0.0005, 52), // 5.2km NE
    distanceKm: 5.2,
    paceSecPerKm: 315,
  },
  {
    label: '동백지구 코스',
    coords: makeRoute(127.1303, 37.2957, 0.0005, 0.001, 41), // 4.1km N
    distanceKm: 4.1,
    paceSecPerKm: 345,
  },
  {
    label: '수지구청 코스',
    coords: makeRoute(127.0976, 37.3216, 0.001, 0.0003, 47), // 4.7km E
    distanceKm: 4.7,
    paceSecPerKm: 320,
  },
  {
    label: '풍덕천 코스',
    coords: makeRoute(127.1171, 37.3015, 0.0002, -0.001, 35), // 3.5km S
    distanceKm: 3.5,
    paceSecPerKm: 375,
  },
  {
    label: '마북동 코스',
    coords: makeRoute(127.0978, 37.3455, 0.0007, -0.0006, 32), // 3.2km SE
    distanceKm: 3.2,
    paceSecPerKm: 350,
  },
  {
    label: '신갈 코스',
    coords: makeRoute(127.1393, 37.2572, -0.0008, 0.0005, 60), // 6.0km NW
    distanceKm: 6.0,
    paceSecPerKm: 300,
  },
  {
    label: '구성 코스',
    coords: makeRoute(127.1691, 37.2649, 0.0003, 0.001, 49), // 4.9km N
    distanceKm: 4.9,
    paceSecPerKm: 310,
  },
  {
    label: '처인구 코스',
    coords: makeRoute(127.2088, 37.2353, -0.0007, 0.0007, 72), // 7.2km NW
    distanceKm: 7.2,
    paceSecPerKm: 295,
  },
];

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB 연결 완료:', MONGODB_URI);

  const Run = mongoose.model('Run', RunSchema);
  const User = mongoose.model('User', UserSchema);

  const targetId = process.argv[2];
  const user = targetId
    ? await User.findById(targetId)
    : await User.findOne();

  if (!user) {
    console.error('유저를 찾을 수 없습니다. 먼저 회원가입을 진행해주세요.');
    process.exit(1);
  }

  console.log(`유저: ${user._id} (${user.email ?? user.username ?? ''})`);

  const docs = YONGIN_RUNS.map((r) => ({
    userId: user._id,
    route: { type: 'LineString', coordinates: r.coords },
    distanceKm: r.distanceKm,
    paceSecPerKm: r.paceSecPerKm,
    photoUrls: [],
    description: r.label,
  }));

  await Run.insertMany(docs);
  console.log(`✓ 용인시 더미 런 ${docs.length}개 삽입 완료`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
