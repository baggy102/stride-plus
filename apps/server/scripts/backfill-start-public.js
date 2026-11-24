// 지도 마커 시작점 백필: startPublic(집 근처를 자른 경로의 첫 점)이 없는 러닝을 채운다.
// - 여러 번 돌려도 결과가 같다: startPublic이 없는 문서만 읽고, 쓸 때도 그 조건을 다시 건다(서버가 먼저 채웠으면 건너뛴다)
// - 원래 시작점은 저장하지 않는다. 개발 중 버전이 남긴 startRaw가 있으면 지운다(없으면 아무 일도 없다)
// - 가림 계산은 서버와 같은 코드(빌드된 dist/runs/start-point.js)를 쓴다. 그래서 먼저 빌드한다
// - 좌표는 로그에 찍지 않는다
// 사용: pnpm --filter @stride/server build
//       node scripts/backfill-start-public.js --dry-run      (읽기만, 몇 개를 채우고 지울지 센다)
//       node scripts/backfill-start-public.js [--batch=500]  (MONGODB_URI가 없으면 로컬 DB)
const path = require('node:path');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stride-plus';
const DEFAULT_BATCH = 500;
const PENDING = { startPublic: { $exists: false } };
const STRAY_RAW = { startRaw: { $exists: true } };

// runs: MongoDB 드라이버 컬렉션. _id 순으로 batch개씩 읽어 채운다(dry-run에서도 같은 문서를 다시 읽지 않게 _id로 넘긴다)
async function backfill(runs, startPublicUpdate, { dryRun = false, batch = DEFAULT_BATCH, log = () => {} } = {}) {
  const tag = dryRun ? '[dry-run] ' : '';
  const todo = await runs.countDocuments(PENDING);
  const strayRaw = await runs.countDocuments(STRAY_RAW);
  const counts = { todo, scanned: 0, updated: 0, emptyRoute: 0, left: todo, strayRaw, rawRemoved: 0 };
  log(`${tag}채울 러닝 ${todo}개(배치 ${batch}개씩), 지울 startRaw ${strayRaw}개`);
  if (strayRaw > 0 && !dryRun) counts.rawRemoved = (await runs.updateMany(STRAY_RAW, { $unset: { startRaw: '' } })).modifiedCount;
  let lastId = null;
  for (;;) {
    const filter = lastId ? { ...PENDING, _id: { $gt: lastId } } : PENDING;
    const docs = await runs.find(filter, { projection: { route: 1 } }).sort({ _id: 1 }).limit(batch).toArray();
    if (docs.length === 0) break;
    lastId = docs[docs.length - 1]._id;
    const ops = docs.map((run) => startPublicUpdate(run._id, run.route?.coordinates ?? []));
    counts.scanned += docs.length;
    counts.emptyRoute += ops.filter((op) => op.updateOne.update.$set.startPublic === null).length;
    if (!dryRun) counts.updated += (await runs.bulkWrite(ops, { ordered: false })).modifiedCount;
    log(`  ${counts.scanned}/${todo} 읽음${dryRun ? '' : `, ${counts.updated}개 채움`}`);
  }
  if (!dryRun) counts.left = await runs.countDocuments(PENDING);
  log(`${tag}끝: 읽음 ${counts.scanned}, 채움 ${counts.updated}, 시작점 없음(빈 경로) ${counts.emptyRoute}, 남은 러닝 ${counts.left}, startRaw 지움 ${counts.rawRemoved}`);
  return counts;
}

function loadStartPublicUpdate() {
  try {
    return require(path.join(__dirname, '../dist/runs/start-point')).startPublicUpdate;
  } catch {
    console.error('dist/runs/start-point.js가 없다. 먼저 빌드한다: pnpm --filter @stride/server build');
    process.exit(1);
  }
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const batchArg = process.argv.find((arg) => arg.startsWith('--batch='));
  const batch = Math.max(1, Math.floor(Number(batchArg?.slice('--batch='.length)) || DEFAULT_BATCH));
  const startPublicUpdate = loadStartPublicUpdate();
  const mongoose = require('mongoose');
  mongoose.connect(uri).then(async () => {
    await backfill(mongoose.connection.db.collection('runs'), startPublicUpdate, { dryRun, batch, log: console.log });
    process.exit(0);
  }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { backfill };
