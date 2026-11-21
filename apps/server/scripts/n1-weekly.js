// 기준 지표 N1: 주(월요일 시작, Asia/Seoul)별 「응원을 1개 이상 받은 러닝」 수와 응원 수. 최근 8주. 읽기만 한다.
// 사용: node scripts/n1-weekly.js  (MONGODB_URI가 없으면 로컬 DB)
// 응원 시각(cheerLog)은 2026-11-21부터 남는다. 그 전 응원은 세지 않는다
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stride-plus';
const WEEKS = 8;

mongoose.connect(uri).then(async () => {
  const since = new Date(Date.now() - WEEKS * 7 * 24 * 3600 * 1000);
  const rows = await mongoose.connection.db.collection('posts').aggregate([
    { $unwind: '$cheerLog' },
    { $match: { 'cheerLog.at': { $gte: since } } },
    { $group: {
      _id: { week: { $dateTrunc: { date: '$cheerLog.at', unit: 'week', startOfWeek: 'monday', timezone: 'Asia/Seoul' } }, post: '$_id' },
      cheers: { $sum: 1 },
    } },
    { $group: { _id: '$_id.week', runs: { $sum: 1 }, cheers: { $sum: '$cheers' } } },
    { $sort: { _id: -1 } },
  ]).toArray();
  console.log('week(KST, 월요일 시작)\tN1(응원 받은 러닝)\t응원 수');
  for (const r of rows) {
    const d = new Date(r._id.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    console.log(`${d}\t${r.runs}\t${r.cheers}`);
  }
  if (rows.length === 0) console.log('(최근 8주 응원 기록 없음)');
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
