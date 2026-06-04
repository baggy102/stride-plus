const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/stride-plus').then(async () => {
  const runs = await mongoose.connection.db.collection('runs').find({}).toArray();
  let fixed = 0;
  for (const run of runs) {
    if (typeof run.userId === 'string') {
      await mongoose.connection.db.collection('runs').updateOne(
        { _id: run._id },
        { $set: { userId: new mongoose.Types.ObjectId(run.userId) } }
      );
      fixed++;
      console.log('fixed:', run._id.toString(), '← userId was string:', run.userId);
    }
  }
  console.log('total fixed:', fixed);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
