import pkg from 'pg';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
   TEMP LINK CREATION
======================================= */

export async function createDownloadLink(data) {

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 1000); // دقيقة

  await write(
    `INSERT INTO temp_links
     (token, user_id, sw_lat, sw_lon, film_code, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      token,
      data.user_id,
      data.sw_lat,
      data.sw_lon,
      data.film_code,
      expiresAt
    ]
  );

  return `${process.env.BASE_URL}/download?token=${token}`;
}

/* =======================================
   EXPRESS DOWNLOAD SERVER (SECURE)
======================================= */

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/download', async (req, res) => {

  const client = await pool.connect();

  try {

    const { token } = req.query;

    await client.query('BEGIN');

    const linkResult = await client.query(
      `SELECT * FROM temp_links
       WHERE token = $1
       AND used = FALSE
       AND expires_at > NOW()
       FOR UPDATE`,
      [token]
    );

    if (linkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Invalid or expired link' });
    }

    const link = linkResult.rows[0];

    const userResult = await client.query(
      `SELECT balance_basic FROM users
       WHERE user_id = $1
       FOR UPDATE`,
      [link.user_id]
    );

    if (userResult.rows.length === 0 ||
        userResult.rows[0].balance_basic <= 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Insufficient balance' });
    }

    await client.query(
      `UPDATE users
       SET balance_basic = balance_basic - 1
       WHERE user_id = $1`,
      [link.user_id]
    );

    await client.query(
      `UPDATE temp_links
       SET used = TRUE
       WHERE token = $1`,
      [token]
    );

    await client.query('COMMIT');

    const filePath =
      `files/${link.sw_lat}_${link.sw_lon}_${link.film_code}.tif`;

    return res.download(filePath);

  } catch (err) {

    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Download failed' });

  } finally {
    client.release();
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