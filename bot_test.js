// bot_test.js
import pkg from 'pg';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';

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

// ================================
// Express Server + Download Route
// ================================
const app = express();
const PORT = process.env.PORT || 3000;

// دالة توليد توكن تحميل مؤقت
export function generateDownloadToken(data) {
  return jwt.sign(data, process.env.DOWNLOAD_SECRET, {
    expiresIn: '60s'
  });
}

// Route للتحميل المؤقت
app.get('/download', async (req, res) => {
  try {
    const { token } = req.query;

    const decoded = jwt.verify(token, process.env.DOWNLOAD_SECRET);
    const { sw_lat, sw_lon, film_code } = decoded;

    // حالياً الملفات على Telegram لاحقاً على مجلد files/
    const filePath = `files/${sw_lat}_${sw_lon}_${film_code}.tif`;

    res.download(filePath);

  } catch (err) {
    return res.status(401).json({ error: 'Link expired or invalid' });
  }
});

// بدء تشغيل Express Server
app.listen(PORT, () => {
  console.log(`🚀 Download server running on port ${PORT}`);
});

// بدء تشغيل البوت بعد اختبار DB
(async () => {
  await testDBConnection();
  console.log('🤖 Telegram Bot is running...');
})();
