const TelegramBot = require('node-telegram-bot-api');

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
