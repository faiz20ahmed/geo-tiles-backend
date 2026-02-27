// ===============================
// Required Packages
// ===============================
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { Client } = require('pg');

// ===============================
// Environment Variables
// ===============================
const token = process.env.BOT_TOKEN; // ضع التوكن في Railway Variables
const DATABASE_URL = process.env.DATABASE_URL;
const PORT = process.env.PORT || 8080;

// ===============================
// PostgreSQL Connection
// ===============================
const db = new Client({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // مطلوب في Railway
  },
});

db.connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL');
  })
  .catch((err) => {
    console.error('❌ PostgreSQL connection error:', err);
  });

// ===============================
// Express Web Server (Railway Requirement)
// ===============================
const app = express();

app.get('/', (req, res) => {
  res.send('Geo Tiles Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ===============================
// Telegram Bot
// ===============================
const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running...');

// Command: /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await db.query(
      `INSERT INTO users (telegram_id, created_at)
       VALUES ($1, NOW())
       ON CONFLICT (telegram_id) DO NOTHING`,
      [chatId]
    );

    bot.sendMessage(chatId, "✅ مرحباً بك في نظام Geo Tiles");
  } catch (error) {
    console.error("DB Error:", error);
    bot.sendMessage(chatId, "⚠️ حدث خطأ في الاتصال بقاعدة البيانات");
  }
});

// Error Handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});
