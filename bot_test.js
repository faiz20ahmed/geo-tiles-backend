import pkg from 'pg';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const { Pool } = pkg;

/* =======================================
   DATABASE CONNECTION
======================================= */

let pool;
let isOffline = false;

async function connectDatabase() {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL_RAILWAY,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000
    });
    await pool.query('SELECT 1');
    console.log("✅ Connected to Railway (Read/Write)");
  } catch (err) {
    console.log("⚠️ Railway unavailable → Switching to Local (Read Only)");
    pool = new Pool({ connectionString: process.env.DATABASE_URL_LOCAL });
    isOffline = true;
  }
}

/* =======================================
   DATABASE HELPERS
======================================= */

async function read(query, params) {
  return pool.query(query, params);
}

async function write(query, params) {
  if (isOffline) throw new Error("SYSTEM_OFFLINE_READ_ONLY");
  return pool.query(query, params);
}

/* =======================================
   TELEGRAM BOT SETUP
======================================= */

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) { console.error("❌ TELEGRAM_BOT_TOKEN missing"); process.exit(1); }
const bot = new TelegramBot(botToken, { polling: true });

/* =======================================
   USER MANAGEMENT
======================================= */

async function registerUser(telegram_id, password) {
  const hashed = await bcrypt.hash(password, 10);
  return write(
    `INSERT INTO users(telegram_id, password_hash, subscription_status, balance_basic)
     VALUES($1,$2,'frozen',0) ON CONFLICT (telegram_id) DO NOTHING`,
    [telegram_id, hashed]
  );
}

async function verifyUser(telegram_id, password) {
  const res = await read(`SELECT * FROM users WHERE telegram_id = $1`, [telegram_id]);
  if (res.rowCount === 0) return false;
  return bcrypt.compare(password, res.rows[0].password_hash) ? res.rows[0] : false;
}

function generateJWT(user) {
  return jwt.sign({ user_id: user.user_id, telegram_id: user.telegram_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

/* =======================================
   BOT HANDLERS
======================================= */

bot.onText(/\/register (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const password = match[1];
  try {
    await registerUser(chatId, password);
    bot.sendMessage(chatId, "✅ تم تسجيلك بنجاح! استخدم /login <password>");
  } catch (err) { bot.sendMessage(chatId, "❌ حدث خطأ أثناء التسجيل"); }
});

bot.onText(/\/login (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const password = match[1];
  try {
    const user = await verifyUser(chatId, password);
    if (!user) return bot.sendMessage(chatId, "❌ خطأ في التوثيق أو كلمة المرور");
    const token = generateJWT(user);
    bot.sendMessage(chatId, `✅ تسجيل الدخول ناجح! JWT Token:\n${token}`);
  } catch (err) { bot.sendMessage(chatId, "❌ حدث خطأ أثناء تسجيل الدخول"); }
});

/* =======================================
   TEMP LINK SYSTEM
======================================= */

export function generateDownloadToken(data) {
  return jwt.sign(data, process.env.DOWNLOAD_SECRET, { expiresIn: '60s' });
}

/* =======================================
   EXPRESS DOWNLOAD SERVER
======================================= */

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/download', async (req, res) => {
  const { token } = req.query;
  let client;
  try {
    const decoded = jwt.verify(token, process.env.DOWNLOAD_SECRET);
    const { user_id, sw_lat, sw_lon, film_code } = decoded;
    client = await pool.connect();
    await client.query('BEGIN');

    const userRes = await client.query(`SELECT * FROM users WHERE user_id=$1 FOR UPDATE`, [user_id]);
    if (userRes.rowCount === 0) throw new Error("USER_NOT_FOUND");
    const user = userRes.rows[0];
    if (user.balance_basic < 1) throw new Error("INSUFFICIENT_BALANCE");

    const filePath = `files/${sw_lat}_${sw_lon}_${film_code}.tif`;

    await client.query(
      `INSERT INTO downloads(user_id, sw_lat, sw_lon, film_code, timestamp, success)
       VALUES($1,$2,$3,$4,NOW(),true)`,
      [user_id, sw_lat, sw_lon, film_code]
    );

    await client.query(
      `UPDATE users SET balance_basic = balance_basic - 1 WHERE user_id = $1`,
      [user_id]
    );

    await client.query('COMMIT');
    res.download(filePath);
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error(err);
    res.status(401).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

/* =======================================
   START SYSTEM
======================================= */

(async () => {
  await connectDatabase();
  console.log("🤖 Bot is running...");
})();
app.listen(PORT, () => console.log(`🚀 Download server running on port ${PORT}`));
