import pkg from 'pg';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';

dotenv.config();

const { Pool } = pkg;

/* =======================================
   DATABASE CONNECTION (Railway → Local)
======================================= */

let pool;
let isOffline = false;

async function connectDatabase() {
  try {
    console.log("🔵 Connecting to Railway...");

    pool = new Pool({
      connectionString: process.env.DATABASE_URL_RAILWAY,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000
    });

    await pool.query('SELECT 1');
    console.log("✅ Using Railway (Read/Write)");

  } catch (err) {

    console.log("⚠️ Railway unavailable → Switching to Local (Read Only)");

    pool = new Pool({
      connectionString: process.env.DATABASE_URL_LOCAL
    });

    isOffline = true;
  }
}

/* قراءة */
async function read(query, params) {
  return pool.query(query, params);
}

/* كتابة */
async function write(query, params) {
  if (isOffline) {
    throw new Error("SYSTEM_OFFLINE_READ_ONLY");
  }
  return pool.query(query, params);
}

/* =======================================
   TELEGRAM BOT
======================================= */

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error("❌ TELEGRAM_BOT_TOKEN غير موجود");
  process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: true });

bot.on('message', async (msg) => {

  const chatId = msg.chat.id;
  const text = msg.text || '';

  console.log(`📨 ${chatId}: ${text}`);

  try {

    if (text === '/start') {
      return bot.sendMessage(chatId, "🚀 Geo Tiles Bot جاهز للعمل");
    }

    if (text === '/status') {
      return bot.sendMessage(
        chatId,
        isOffline
          ? "⚠️ النظام يعمل بوضع القراءة فقط"
          : "✅ النظام متصل بـ Railway"
      );
    }

    // مثال تسجيل رسالة (كتابة)
    await write(
      'INSERT INTO messages(chat_id, username, text, created_at) VALUES($1,$2,$3,NOW())',
      [chatId, msg.from.username || msg.from.first_name, text]
    );

    bot.sendMessage(chatId, `تم حفظ رسالتك: "${text}"`);

  } catch (err) {

    if (err.message === "SYSTEM_OFFLINE_READ_ONLY") {
      return bot.sendMessage(chatId, "⚠️ النظام في وضع الطوارئ، لا يمكن تنفيذ عمليات كتابة حالياً.");
    }

    console.error(err);
    bot.sendMessage(chatId, "❌ حدث خطأ");
  }

});

/* =======================================
   EXPRESS DOWNLOAD SERVER
======================================= */

const app = express();
const PORT = process.env.PORT || 3000;

export function generateDownloadToken(data) {
  return jwt.sign(data, process.env.DOWNLOAD_SECRET, {
    expiresIn: '60s'
  });
}

app.get('/download', async (req, res) => {

  try {

    const { token } = req.query;
    const decoded = jwt.verify(token, process.env.DOWNLOAD_SECRET);

    const { sw_lat, sw_lon, film_code } = decoded;
    const filePath = `files/${sw_lat}_${sw_lon}_${film_code}.tif`;

    res.download(filePath);

  } catch (err) {
    return res.status(401).json({ error: 'Link expired or invalid' });
  }

});

app.listen(PORT, () => {
  console.log(`🚀 Download server running on port ${PORT}`);
});

/* =======================================
   START SYSTEM
======================================= */

(async () => {
  await connectDatabase();
  console.log("🤖 Bot is running...");
})();
