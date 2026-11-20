// 이메일로 사용자를 찾아 role을 operator로 바꾼다(지도 피드 운영자 표시). 정규화 안 된 이메일·대소문자 중복 수도 출력한다(읽기만).
// 사용: node scripts/set-operator.js stride.plus1@gmail.com  (MONGODB_URI가 없으면 로컬 DB)
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stride-plus';
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('usage: node scripts/set-operator.js <email>'); process.exit(1); }

mongoose.connect(uri).then(async () => {
  const users = mongoose.connection.db.collection('users');
  const notNormalized = await users.countDocuments({ email: /[A-Z]|^\s|\s$/ });
  const caseDuplicates = await users.aggregate([
    { $group: { _id: { $toLower: '$email' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  console.log('not normalized emails:', notNormalized, '/ case duplicates:', caseDuplicates.length);
  const result = await users.updateOne({ email }, { $set: { role: 'operator' } });
  console.log('operator matched:', result.matchedCount, 'modified:', result.modifiedCount);
  process.exit(result.matchedCount === 1 ? 0 : 2);
}).catch((e) => { console.error(e); process.exit(1); });
