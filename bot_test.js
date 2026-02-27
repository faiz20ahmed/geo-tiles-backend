// bot_test.js
import pkg from 'pg';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config(); // تحميل متغيرات البيئة

const { Pool } = pkg;

// --- إعداد قاعدة البيانات PostgreSQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testDBConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ تم الاتصال بقاعدة البيانات PostgreSQL بنجاح');
    client.release();
  } catch (err) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err);
  }
}

// --- إعداد بوت Telegram ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('❌ خطأ: لم يتم تحديد TELEGRAM_BOT_TOKEN في متغيرات البيئة.');
  process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: true });

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  console.log(`📨 رسالة واردة من ${msg.from.username || msg.from.first_name}: ${text}`);

  // مثال: حفظ كل رسالة في قاعدة البيانات
  try {
    await pool.query(
      'INSERT INTO messages(chat_id, username, text, created_at) VALUES($1, $2, $3, NOW())',
      [chatId, msg.from.username || msg.from.first_name, text]
    );
  } catch (err) {
    console.error('❌ خطأ في إدخال الرسالة في قاعدة البيانات:', err);
  }

  // الرد على المستخدم
  bot.sendMessage(chatId, `تم استلام رسالتك: "${text}"`);
});

// بدء تشغيل
(async () => {
  await testDBConnection();
  console.log('🤖 Telegram Bot is running...');
})();
