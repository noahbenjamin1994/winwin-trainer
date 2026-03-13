# XAUUSD Trainer

A historical `XAUUSD 1M` trading training project with a separated frontend/backend stack:

- Backend: `FastAPI` (game state, anti-cheat market data, fast-forward settlement)
- Frontend: `Next.js + lightweight-charts` (charting and training interaction)

Goal: train execution and risk-control discipline without exposing future market data.

## 1. Features

- Random historical start point per game, up to `10` trades per session
- Time stepping: `+1M / +5M / +15M / +1H`
- Timeframe switch: `1M / 5M / 15M / 1H / 4H / 1D`
- Username + password auth; new usernames auto-register with a one-time generated password
- Orders are settled by backend fast-forward until `SL / TP / stop_out / data_end`
- Stepping to the end of available data ends the current game (`data_end`)
- Fixed spread and consistent contract rules for reproducible PnL
- Persistent trade history, personal metrics (win rate / Sharpe / total PnL), and global leaderboard
- Frontend i18n: Chinese/English switch

## 2. Project Structure

```text
xauusd_trainer/
├── backend/
│   ├── main.py            # FastAPI service and settlement logic
│   ├── trainer.db         # SQLite database (auto-created)
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── app/               # Next.js app routes/pages
│   ├── components/        # Chart, order panel, controls, stats views
│   ├── lib/               # API client, types, i18n
│   └── next.config.js     # /api proxy config
└── README.zh.md           # Chinese documentation
```

## 3. Requirements

- Python `3.10+`
- Node.js `18+` (recommended `20+`)
- npm `9+`

## 4. Quick Start

### 4.1 Start Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Backend default URL: `http://localhost:8000`

### 4.2 Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:3000`

`next.config.js` proxies `/api/*` to backend:

- Local default: `http://localhost:8000/api/*`
- Production: set `BACKEND_API_BASE` (for example `https://api.your-domain.com`)

## 5. Authentication Notes

- Submit a new username (3-24 chars, letters/numbers/underscore) to auto-create an account
- System generates a 12-character random password (letters + numbers)
- Save the generated password immediately (copy/screenshot)
- Auth token is hashed on server side and expires in `90` days

## 6. Data Requirement

Backend loads:

`~/data/workspace/finance/data_history/XAUUSD_1M.parquet`

If your path differs, update `DATA_PATH` in `backend/main.py`.

Parquet must include at least:

- `time` (convertible to datetime)
- `open`
- `high`
- `low`
- `close`
- `tick_volume`

## 7. Trading Rules (Implemented)

- Symbol: `XAUUSD`
- Contract size: `1 lot = 100 oz`
- Fixed spread: `$0.20` (20 points)
- Display leverage: `1:100`
- Minimum lot: `0.01`
- Minimum initial balance: `$10`
- Max trades per game: `10`

Margin & stop-out model (based on Jinrong China public rules used in this project):

- Margin for gold: `1 lot = $1000`, so `0.01 lot = $10`
- Entry check: `balance >= required margin`
- Margin ratio: `equity / used margin * 100%`
- Stop-out trigger: `<= 30%`

Price coordinate:

- Chart/K-line uses `Bid`
- `Ask = Bid + 0.20`
- Buy entry uses `Ask`, Sell entry uses `Bid`
- Frontend `SL/TP` input uses `Bid` coordinate

## 8. Anti-Cheat Design

- Every session maintains `current_time` as the visible boundary
- K-line API strictly returns data `<= current_time`
- Step API returns incremental 1M bars only
- Random start uses safe buffers: first `5000`, last `10000` 1M bars excluded

## 9. API Overview

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/stats/me`
- `GET /api/leaderboard`
- `POST /api/game/start`
- `GET /api/market/klines`
- `POST /api/game/step`
- `POST /api/trade/order`
- `GET /api/game/session/{session_id}`

## 10. Important Notes

- Session state is cached in memory and recoverable from DB on cache miss/restart
- Users, sessions, trades, steps, and operation logs persist in `backend/trainer.db`
- Current CORS is `allow_origins=["*"]` and should be restricted for production
- This project is a training simulator, not investment advice

## 11. Production Checklist

At minimum, add:

- Strict CORS allow-list
- API rate limiting
- Strong deployment/network boundary controls
- Monitoring and audit strategy

## 12. Personal Story

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

## 13. Affiliate Disclosure

I joined the Upway affiliate program.  
If you are looking for a live/demo gold trading platform, you can use my referral link:

https://login.jrjr.com/#/user/reg/tjsid=851345

If you register via this link, I may receive an affiliate commission.  
Thank you for supporting this project ❤️
