// bot_test.js (نسخة محدثة للـ Railway)
import { Client, GatewayIntentBits } from 'discord.js'; // أو من أي مكتبة Telegram حسب مشروعك
import pg from 'pg';

// قراءة المتغيرات من البيئة
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN غير موجود في Environment Variables');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL غير موجود في Environment Variables');
  process.exit(1);
}

// إعداد قاعدة البيانات
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // مهم إذا Railway يستخدم SSL
});

pool.connect()
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات PostgreSQL بنجاح'))
  .catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err);
    process.exit(1);
  });

// إعداد البوت
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// بدء البوت
bot.once('ready', () => {
  console.log(`🤖 البوت يعمل الآن كـ ${bot.user.tag}`);
});

bot.on('messageCreate', async message => {
  if (message.author.bot) return;

  // مثال بسيط: عند إرسال "!ping" يرد "Pong!"
  if (message.content === '!ping') {
    message.reply('Pong!');
  }
});

// تسجيل الدخول
bot.login(BOT_TOKEN)
  .catch(err => {
    console.error('❌ خطأ في تسجيل الدخول للبوت:', err);
    process.exit(1);
  });

// عند إغلاق العملية
process.on('SIGINT', async () => {
  console.log('🛑 جاري إغلاق الاتصال بقاعدة البيانات...');
  await pool.end();
  process.exit(0);
});
