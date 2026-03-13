# XAUUSD Trainer

![XAUUSD Trainer Banner](assets/readme-banner.jpg)

A replay-based **XAUUSD trading simulator** built for one thing: train execution and risk control without leaking future candles.

- 🌐 Languages: English + auto-translated entries via zdoc.app
  [中文](https://www.zdoc.app/zh/noahbenjamin1994/winwin-trainer) |
  [日本語](https://www.zdoc.app/ja/noahbenjamin1994/winwin-trainer) |
  [한국어](https://www.zdoc.app/ko/noahbenjamin1994/winwin-trainer) |
  [Español](https://www.zdoc.app/es/noahbenjamin1994/winwin-trainer) |
  [Français](https://www.zdoc.app/fr/noahbenjamin1994/winwin-trainer) |
  [Deutsch](https://www.zdoc.app/de/noahbenjamin1994/winwin-trainer) |
  [Русский](https://www.zdoc.app/ru/noahbenjamin1994/winwin-trainer) |
  [Português](https://www.zdoc.app/pt/noahbenjamin1994/winwin-trainer) |
  [العربية](https://www.zdoc.app/ar/noahbenjamin1994/winwin-trainer)
- 🧠 Focus: discipline, anti-cheat replay, risk awareness
- 🛠 Stack: FastAPI + Next.js + lightweight-charts

## ✨ Features

- 🎲 Random historical start per session
- ⏩ Time stepping: `+1M / +5M / +15M / +1H`
- 🕯 Timeframes: `1M / 5M / 15M / 1H / 4H / 1D`
- 🔐 Username + password auth (new users get one-time generated password)
- ⚡ Backend fast-forward settlement until `SL / TP / stop_out / data_end`
- 📈 Personal stats: win rate, Sharpe, total PnL
- 🏆 Global leaderboard
- 🌍 Frontend i18n (Chinese / English)

## 🧱 Tech Stack

- Backend: `FastAPI` + `SQLite`
- Frontend: `Next.js 14` + `TypeScript` + `tailwindcss`
- Charting: `TradingView lightweight-charts`

## 🗂 Project Structure

```text
xauusd_trainer/
├── backend/
│   ├── main.py
│   ├── trainer.db
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── next.config.js
├── assets/
│   └── readme-banner.jpg
└── README.md
```

## 🚀 Quick Start

### 1) Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Backend: `http://localhost:8000`

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`

`/api/*` is proxied by `next.config.js`:

- Local default: `http://localhost:8000/api/*`
- Production: set `BACKEND_API_BASE` (example: `https://api.your-domain.com`)

## 🔐 Authentication

- New username (3–24 letters/numbers/underscore) auto-creates an account
- A 12-character one-time password is generated for new users
- Save it immediately (copy/screenshot)
- Auth token is hashed server-side and valid for `90` days

## 📊 Market & Risk Rules

- Symbol: `XAUUSD`
- Contract size: `1 lot = 100 oz`
- Fixed spread: `$0.20` (20 points)
- Min lot: `0.01`
- Min initial balance: `$10`
- Max trades per game: `10`

Margin model used in this project:

- Gold margin: `1 lot = $1000` (so `0.01 lot = $10`)
- Entry requires: `balance >= required margin`
- Margin ratio: `equity / used margin * 100%`
- Stop-out trigger: `<= 30%`

Price coordinate:

- Chart/K-line = `Bid`
- `Ask = Bid + 0.20`
- Buy entry uses `Ask`, Sell entry uses `Bid`
- Frontend `SL/TP` input uses `Bid` coordinate

## 🛡 Anti-Cheat Design

- Each session has a strict `current_time` boundary
- K-line API only returns data `<= current_time`
- Step API returns incremental 1M bars only
- Random start excludes first `5000` and last `10000` bars

## 🧩 API Endpoints

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/stats/me`
- `GET /api/leaderboard`
- `POST /api/game/start`
- `GET /api/market/klines`
- `POST /api/game/step`
- `POST /api/trade/order`
- `GET /api/game/session/{session_id}`

## 📌 Important Notes

- Session state is cached in memory and recoverable from DB on cache miss/restart
- Users, sessions, trades, steps, and operation logs persist in `backend/trainer.db`
- CORS is currently permissive (`allow_origins=["*"]`) and should be restricted in production
- This project is for training/research use only, not investment advice

## 🗺 Production Checklist

- Strict CORS allow-list
- API rate limiting
- Deployment/network boundary hardening
- Monitoring and audit strategy

## 🧭 Personal Story

I built this platform because of an experience in my own family.  
My father has traded XAUUSD for a long time. He believes strongly in his method, and often says he can make a few hundred dollars a day.  
But over a longer window, his cumulative loss was already more than $8,000.

I was pulled into this market as well.  
The beginning looked great. In just a few days, my account went from $3,000 to $9,000+, and it was easy to believe I had finally figured it out.  
Then came the extreme move from January 29, 2026 to February 2, 2026. Gold dropped hard, most of the profit was erased, and the account came close to a margin call.

After that, I had to face one fact:  
the hardest part of trading is staying clear-headed over time.  
So I built this platform.  
I want it to pull people back from emotion into rules, and to train execution and risk control in a replayable environment.  
I built it for my father first, and as a reminder for myself.

## 🤝 Affiliate Disclosure

I joined the Upway affiliate program.  
If you are looking for a live/demo gold trading platform, you can use my referral link:

https://login.jrjr.com/#/user/reg/tjsid=851345

If you register via this link, I may receive an affiliate commission.  
Thank you for supporting this project ❤️
