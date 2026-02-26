const TelegramBot = require('node-telegram-bot-api');

// قراءة التوكن من متغير البيئة
const token = process.env.TELEGRAM_BOT_TOKEN;

// تفعيل البوت باستخدام long polling
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  bot.sendMessage(chatId, `تم استلام رسالتك: "${text}"`);
});

console.log('Bot is running...');
