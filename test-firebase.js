const admin = require('firebase-admin');
const chalk = require('chalk');
const serviceAccount = require('./serviceAccountKey.json');

console.log(chalk.cyan('\n🔥 Firebase কানেকশন পরীক্ষা করা হচ্ছে...\n'));

// \n এর সমস্যা এড়াতে এইভাবে ইনিশিয়ালাইজ করা ভালো
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key.replace(/\\n/g, '\n')
  })
});

const db = admin.firestore();

async function runTest() {
  try {
    const testRef = db.collection('test_connection').doc('status');
    await testRef.set({
      connected: true,
      time: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(chalk.green('✅ Firestore-এ ডেটা লিখা সফল হয়েছে!'));

    const doc = await testRef.get();
    console.log(chalk.green('✅ Firestore থেকে ডেটা পড়া সফল হয়েছে!'));

    await testRef.delete();
    console.log(chalk.yellow('✅ টেস্ট ডেটা মুছে ফেলা হয়েছে।'));

    console.log(chalk.bold.green('\n🎉 অভিনন্দন! আপনার আসল কি (Key) এখন কাজ করছে।\n'));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('\n❌ এরর পাওয়া গেছে:'), error.message);
    process.exit(1);
  }
}

runTest();