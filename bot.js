require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const pairs = require("./config/pairs");
const { multiTF } = require("./services/signal");

const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN = 1869006879;

let selectedPair = "EURUSDT";
let selectedTF = "1m";
let running = true;
let intervalId = null;

// ===== START =====
bot.start((ctx) => {
  if (ctx.from.id !== ADMIN) return;

  running = true; // ✅ reset

  const name = ctx.from.first_name || "Trader";

  ctx.reply(
`👋 Welcome ${name}

🤖 ELITE Forex Bot`,
Markup.keyboard([
  ["📊 Pairs","⏱ Timeframe","🛑 STOP"]
]).resize()
  );
});

// ===== PAIRS =====
bot.hears("📊 Pairs", (ctx) => {

  const buttons = [];

  for (let i = 0; i < pairs.length; i += 2) {
    buttons.push([
      Markup.button.callback(pairs[i], `pair_${pairs[i]}`),
      pairs[i + 1]
        ? Markup.button.callback(pairs[i + 1], `pair_${pairs[i + 1]}`)
        : null
    ].filter(Boolean));
  }

  ctx.reply("Select pair 👇",
    Markup.inlineKeyboard(buttons)
  );
});

// ===== TIMEFRAME =====
bot.hears("⏱ Timeframe", (ctx) => {
  ctx.reply("Select timeframe 👇",
    Markup.keyboard([["1m","5m","15m"]]).resize()
  );
});

bot.hears(["1m","5m","15m"], async (ctx) => {

  selectedTF = ctx.message.text;

  await ctx.reply(
`✅ Timeframe set: ${selectedTF}`,
Markup.keyboard([
  ["📊 Pairs","⏱ Timeframe","🛑 STOP"]
]).resize()
  );
});

// ===== AUTO SIGNAL =====
function startAutoSignal() {

  running = true; // ✅ կարևոր FIX

  if (intervalId) clearInterval(intervalId);

  let time = 60000;

  if (selectedTF === "5m") time = 300000;
  if (selectedTF === "15m") time = 900000;

  intervalId = setInterval(async () => {

    if (!running) return;

    try {
      const data = await multiTF(selectedPair, selectedTF);

      await bot.telegram.sendMessage(ADMIN,
`📊 ${selectedPair}
⏱ ${selectedTF}

RSI: ${data.details.rsi}
MACD: ${data.details.macd}
Stochastic: ${data.details.stoch}
EMA: ${data.details.ema50}
Price: ${data.details.price}

🔥 Signal: ${data.final}`);
    } catch (e) {
      console.log("Signal error:", e.message);
    }

  }, time);
}

// ===== SELECT PAIR =====
bot.action(/pair_(.+)/, async (ctx) => {

  const pair = ctx.match[1];
  selectedPair = pair;

  await ctx.reply(`⏳ Analyzing ${pair}...`);

  await new Promise(r => setTimeout(r, 3000));

  const data = await multiTF(pair, selectedTF);

  await ctx.reply(`📊 ${pair}
⏱ ${selectedTF}

📈 RSI: ${data.details.rsi}
📊 MACD: ${data.details.macd}
📉 Stochastic: ${data.details.stoch}
⚡ Momentum: ${data.details.momentum}

EMA: ${data.details.ema50}
Price: ${data.details.price}

🔥 Signal: ${data.final}`);

  // ✅ այստեղից սկսում է ճիշտ interval
  startAutoSignal();
});

// ===== STOP =====
bot.hears("🛑 STOP", (ctx) => {
  running = false;

  if (intervalId) clearInterval(intervalId);

  ctx.reply("⛔ STOPPED");
});

// ===== ERRORS =====
process.on("unhandledRejection", e => console.log(e));
bot.catch(e => console.log(e));

// ===== START =====
bot.launch();
console.log("🚀 BOT STARTED");