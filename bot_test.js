const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const app = express();
const port = process.env.PORT || 8080;

// Web server بسيط لإرضاء Railway
app.get('/', (req, res) => {
    res.send('Bot is running');
});

app.listen(port, () => {
    console.log(`Web server running on port ${port}`);
});

// ===== Telegram Bot =====

const token = process.env.BOT_TOKEN;

if (!token) {
    console.error("BOT_TOKEN is missing!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log("Bot is running...");

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Bot is working successfully ✅");
});

bot.on('message', (msg) => {
    if (msg.text !== "/start") {
        bot.sendMessage(msg.chat.id, `You said: ${msg.text}`);
    }
});
