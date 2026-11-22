// 포스트의 runId·userId·likes가 문자열로 저장된 문서를 ObjectId로 바꾼다(posts.schema가 Mixed였던 때 생긴 데이터).
// 사용: node scripts/fix-post-id-types.js  (MONGODB_URI가 없으면 로컬 DB)
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stride-plus';
const toId = (value) => (typeof value === 'string' && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : value);

mongoose.connect(uri).then(async () => {
  const posts = mongoose.connection.db.collection('posts');
  const broken = await posts
    .find({ $or: [{ runId: { $type: 'string' } }, { userId: { $type: 'string' } }, { likes: { $elemMatch: { $type: 'string' } } }] })
    .toArray();
  for (const post of broken) {
    await posts.updateOne(
      { _id: post._id },
      { $set: { runId: toId(post.runId), userId: toId(post.userId), likes: (post.likes || []).map(toId) } },
    );
  }
  console.log('total fixed:', broken.length);
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
