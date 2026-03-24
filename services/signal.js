const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ===== API =====

// Binance (crypto)
async function getCandles(symbol, interval) {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
  );
  return res.json();
}

// Forex (TwelveData)
require("dotenv").config();

const FOREX_API_KEY = process.env.FOREX_API_KEY;

async function getForexCandles(symbol, interval) {

  // 🔥 FIX SYMBOL (EURUSD → EUR/USD)
  if (!symbol.includes("/")) {
    symbol = symbol.slice(0,3) + "/" + symbol.slice(3);
  }

  const map = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "1h": "1h",
    "4h": "4h"
  };

  const res = await fetch(
    `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${map[interval]}&outputsize=100&apikey=${FOREX_API_KEY}`
  );

  const data = await res.json();

  if (!data.values) return [];

  return data.values.reverse().map(x => [
    0,0,0,0,parseFloat(x.close)
  ]);
}

// 🔥 UNIVERSAL API
async function getCandlesUniversal(symbol, interval) {
  if (symbol.endsWith("USDT")) {
    return await getCandles(symbol, interval);
  }
  return await getForexCandles(symbol, interval);
}

// ===== INDICATORS =====

// ✅ FIXED RSI
function RSI(closes, p = 14) {
  let gains = 0, losses = 0;

  for (let i = 1; i < p; i++) {
    let d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }

  let avgG = gains / p;
  let avgL = losses / p;

  for (let i = p; i < closes.length; i++) {
    let d = closes[i] - closes[i - 1];

    if (d >= 0) {
      avgG = (avgG * (p - 1) + d) / p;
      avgL = (avgL * (p - 1)) / p;
    } else {
      avgG = (avgG * (p - 1)) / p;
      avgL = (avgL * (p - 1) - d) / p;
    }
  }

  if (avgL === 0) return 100; // 🔥 FIX

  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

function EMA(closes, p) {
  const k = 2 / (p + 1);
  let ema = closes[0];

  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }

  return ema;
}

function MACD(closes) {
  return EMA(closes, 12) > EMA(closes, 26) ? "BUY" : "SELL";
}

function STOCH(closes) {
  const r = closes.slice(-14);
  const low = Math.min(...r);
  const high = Math.max(...r);

  const k = ((closes.at(-1) - low) / (high - low)) * 100;

  if (k < 30) return "BUY";
  if (k > 70) return "SELL";
  return "WAIT";
}

function MOM(closes) {
  return closes.at(-1) - closes.at(-10);
}

function VOL(closes) {
  let s = 0;
  for (let i = 1; i < closes.length; i++) {
    s += Math.abs(closes[i] - closes[i - 1]);
  }
  return s / closes.length;
}

// ===== ENTRY TIME =====
function getEntryTime(tf) {
  const now = new Date();
  let m = now.getMinutes();
  let s = now.getSeconds();

  if (tf === "1m") return 60 - s;

  if (tf === "5m") {
    const next = 5 - (m % 5);
    return next * 60 - s;
  }

  if (tf === "15m") {
    const next = 15 - (m % 15);
    return next * 60 - s;
  }

  return 60;
}

// ===== ANALYZE (STRICT VERSION) =====
function analyze(closes) {

  const rsi = RSI(closes);
  const macd = MACD(closes);
  const stoch = STOCH(closes);
  const mom = MOM(closes);

  const ema50 = EMA(closes, 50);
  const ema200 = EMA(closes, 200);
  const price = closes.at(-1);

  const vol = VOL(closes);

  let signal = "WAIT ⏳";

  // volatility filter
  if (vol < 0.00008) {
    return {
      signal,
      rsi: rsi.toFixed(2),
      macd,
      stoch,
      momentum: mom.toFixed(5),
      ema50: ema50.toFixed(5),
      ema200: ema200.toFixed(5),
      price: price.toFixed(5)
    };
  }

  // RSI neutral → WAIT
  if (rsi > 40 && rsi < 60) {
    return {
      signal,
      rsi: rsi.toFixed(2),
      macd,
      stoch,
      momentum: mom.toFixed(5),
      ema50: ema50.toFixed(5),
      ema200: ema200.toFixed(5),
      price: price.toFixed(5)
    };
  }

  // trend required
  const upTrend = price > ema50 && ema50 > ema200;
  const downTrend = price < ema50 && ema50 < ema200;

  if (!upTrend && !downTrend) {
    return {
      signal,
      rsi: rsi.toFixed(2),
      macd,
      stoch,
      momentum: mom.toFixed(5),
      ema50: ema50.toFixed(5),
      ema200: ema200.toFixed(5),
      price: price.toFixed(5)
    };
  }

  let score = 0;

  // strong RSI
  if (rsi < 35) score += 2;
  if (rsi > 65) score -= 2;

  if (macd === "BUY") score++;
  else score--;

  if (stoch === "BUY") score++;
  if (stoch === "SELL") score--;

  if (mom > 0) score++;
  if (mom < 0) score--;

  if (upTrend) score += 2;
  if (downTrend) score -= 2;

  // strict signals
  if (score >= 4) signal = "BUY 📈";
  if (score <= -4) signal = "SELL 📉";

  return {
    signal,
    rsi: rsi.toFixed(2),
    macd,
    stoch,
    momentum: mom.toFixed(5),
    ema50: ema50.toFixed(5),
    ema200: ema200.toFixed(5),
    price: price.toFixed(5)
  };
}

// ===== MULTI TF =====
async function multiTF(symbol, tf) {

  const map = {
    "1m": ["1m","5m","15m"],
    "5m": ["5m","15m","1h"],
    "15m": ["15m","1h","4h"]
  };

  const tfs = map[tf];
  let results = [];

  for (let t of tfs) {

    const c = await getCandlesUniversal(symbol, t);

    if (!Array.isArray(c) || c.length === 0) continue;

    const closes = c.map(x => parseFloat(x[4]));
    results.push(analyze(closes));
  }

  const buys = results.filter(r => r.signal.includes("BUY")).length;
  const sells = results.filter(r => r.signal.includes("SELL")).length;

  let final = "WAIT ⏳";

  if (buys >= 2) final = "BUY 📈 CONFIRMED";
  if (sells >= 2) final = "SELL 📉 CONFIRMED";

  return {
    final,
    details: results[0] || {
      rsi: "0",
      macd: "WAIT",
      stoch: "WAIT",
      momentum: "0",
      ema50: "0",
      ema200: "0",
      price: "0"
    }
  };
}

module.exports = { multiTF, getEntryTime };