"""
XAUUSD CFD training backend (FastAPI).
Core anti-cheat rule:
Only return market data up to each session's current_time boundary.
"""

import os
import uuid
import json
import re
import secrets
import sqlite3
import string
import hashlib
import bcrypt
from contextvars import ContextVar
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# App initialization
# ---------------------------------------------------------------------------
app = FastAPI(title="XAUUSD Training System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Core constants
# ---------------------------------------------------------------------------
SPREAD: float = 0.20
CONTRACT_SIZE: int = 100
MAX_TRADES: int = 10
LEVERAGE: int = 100
MARGIN_REQUIRED_PER_LOT: float = 1000.0
MARGIN_CALL_RATIO_PCT: float = 100.0
STOP_OUT_RATIO_PCT: float = 30.0
MIN_SLTP_DISTANCE_USD: float = 2.0

DB_PATH = os.path.expanduser(
    os.getenv("DB_PATH", str(Path(__file__).resolve().parent / "trainer.db"))
)
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,24}$")
PASSWORD_LEN = 12
BCRYPT_HASH_PREFIXES = ("$2a$", "$2b$", "$2y$")
TOKEN_TTL_DAYS = int(os.getenv("TOKEN_TTL_DAYS", "90"))

TIMEFRAME_RULES: dict[str, str] = {
    "1M":  "1min",
    "5M":  "5min",
    "15M": "15min",
    "1H":  "1h",
    "4H":  "4h",
    "1D":  "1D",
}

_request_lang: ContextVar[str] = ContextVar("request_lang", default="en")

_ERROR_MESSAGES: dict[str, dict[str, str]] = {
    "username_invalid": {
        "en": "Username must be 3-24 chars (letters/numbers/underscore)",
        "zh": "用户名仅支持 3-24 位字母/数字/下划线",
    },
    "insufficient_history": {
        "en": "Insufficient history: row count must be greater than {required}",
        "zh": "历史数据不足：请确保数据行数大于 {required}",
    },
    "time_before_data_start": {
        "en": "Timestamp {time} is earlier than dataset start time",
        "zh": "时间 {time} 早于数据起始时间",
    },
    "auth_required": {
        "en": "Please log in first",
        "zh": "未登录，请先登录",
    },
    "auth_header_invalid": {
        "en": "Invalid Authorization format, use Bearer token",
        "zh": "Authorization 格式错误，需使用 Bearer Token",
    },
    "auth_expired": {
        "en": "Login expired, please log in again",
        "zh": "登录已失效，请重新登录",
    },
    "sort_by_invalid": {
        "en": "sort_by only supports win_rate / sharpe / total_pnl",
        "zh": "sort_by 只支持 win_rate / sharpe / total_pnl",
    },
    "data_end_no_fast_forward": {
        "en": "Reached end of data, cannot fast-forward",
        "zh": "数据已到末尾，无法继续快进",
    },
    "username_exists_password_required": {
        "en": "Username exists, please enter password",
        "zh": "该用户名已存在，请输入密码",
    },
    "invalid_credentials": {
        "en": "Invalid username or password",
        "zh": "用户名或密码错误",
    },
    "limit_out_of_range": {
        "en": "limit must be between 1 and 200",
        "zh": "limit 取值范围为 1-200",
    },
    "timeframe_unsupported": {
        "en": "Unsupported timeframe: {timeframe}, available: {choices}",
        "zh": "不支持的周期: {timeframe}，可选: {choices}",
    },
    "game_over_cannot_step": {
        "en": "Game is over, cannot continue stepping",
        "zh": "游戏已结束，无法继续推演",
    },
    "step_minutes_invalid": {
        "en": "step_minutes only supports 1/5/15/60",
        "zh": "step_minutes 只支持 1/5/15/60",
    },
    "game_over": {
        "en": "Game is over",
        "zh": "游戏已结束",
    },
    "trades_exhausted": {
        "en": "All {max_trades} trade chances are used",
        "zh": "已用完全部 {max_trades} 次交易机会",
    },
    "direction_invalid": {
        "en": "direction must be Buy or Sell",
        "zh": "direction 必须为 Buy 或 Sell",
    },
    "margin_insufficient": {
        "en": "Insufficient margin: required ${required:.2f}, balance ${balance:.2f}",
        "zh": "保证金不足：开仓需要 ${required:.2f}，当前余额 ${balance:.2f}",
    },
    "buy_sl_min_distance": {
        "en": "Buy SL must be <= current price({bid:.2f}) - {dist:.2f}",
        "zh": "多单止损必须 <= 当前价({bid:.2f}) - {dist:.2f}",
    },
    "buy_tp_min_distance": {
        "en": "Buy TP must be >= current price({bid:.2f}) + {dist:.2f}",
        "zh": "多单止盈必须 >= 当前价({bid:.2f}) + {dist:.2f}",
    },
    "buy_sl_below_entry": {
        "en": "Buy SL({sl:.2f}) must be below entry({entry:.2f})",
        "zh": "多单止损({sl:.2f})必须低于入场价({entry:.2f})",
    },
    "buy_tp_above_entry": {
        "en": "Buy TP({tp:.2f}) must be above entry({entry:.2f})",
        "zh": "多单止盈({tp:.2f})必须高于入场价({entry:.2f})",
    },
    "sell_sl_min_distance": {
        "en": "Sell SL must be >= current price({bid:.2f}) + {dist:.2f}",
        "zh": "空单止损必须 >= 当前价({bid:.2f}) + {dist:.2f}",
    },
    "sell_tp_min_distance": {
        "en": "Sell TP must be <= current price({bid:.2f}) - {dist:.2f}",
        "zh": "空单止盈必须 <= 当前价({bid:.2f}) - {dist:.2f}",
    },
    "sell_sl_above_entry": {
        "en": "Sell SL({sl:.2f}) must be above entry({entry:.2f})",
        "zh": "空单止损({sl:.2f})必须高于入场价({entry:.2f})",
    },
    "sell_tp_below_entry": {
        "en": "Sell TP({tp:.2f}) must be below entry({entry:.2f})",
        "zh": "空单止盈({tp:.2f})必须低于入场价({entry:.2f})",
    },
    "session_missing_or_expired": {
        "en": "Session {session_id!r} does not exist or has expired",
        "zh": "Session {session_id!r} 不存在或已过期",
    },
    "session_forbidden": {
        "en": "No permission to access this session",
        "zh": "无权访问该 Session",
    },
}


def _normalize_lang(raw: Optional[str]) -> str:
    if not raw:
        return "en"
    head = raw.split(",", 1)[0].strip().lower()
    if head.startswith("zh"):
        return "zh"
    return "en"


def _msg(key: str, **kwargs) -> str:
    lang = _request_lang.get()
    data = _ERROR_MESSAGES.get(key, {})
    template = data.get(lang) or data.get("en") or key
    return template.format(**kwargs)


@app.middleware("http")
async def _language_middleware(request: Request, call_next):
    token = _request_lang.set(_normalize_lang(request.headers.get("accept-language")))
    try:
        return await call_next(request)
    finally:
        _request_lang.reset(token)


def _utc_now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def _db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _db_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_login_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS game_sessions (
                session_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                initial_balance REAL NOT NULL,
                current_balance REAL NOT NULL,
                start_time TEXT NOT NULL,
                current_time TEXT NOT NULL,
                trades_used INTEGER NOT NULL,
                game_over INTEGER NOT NULL DEFAULT 0,
                game_over_reason TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                trade_no INTEGER NOT NULL,
                direction TEXT NOT NULL,
                lot_size REAL NOT NULL,
                entry_time TEXT NOT NULL,
                close_time TEXT NOT NULL,
                entry_price REAL NOT NULL,
                close_price REAL NOT NULL,
                sl REAL NOT NULL,
                tp REAL NOT NULL,
                pnl REAL NOT NULL,
                close_reason TEXT NOT NULL,
                balance_before REAL NOT NULL,
                balance_after REAL NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES game_sessions(session_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS step_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                from_time TEXT NOT NULL,
                to_time TEXT NOT NULL,
                step_minutes INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES game_sessions(session_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS operation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS auth_tokens (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON game_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_steps_user_id ON step_events(user_id);
            CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);
            CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at ON auth_tokens(expires_at);
            """
        )


def _is_bcrypt_hash(password_hash: str) -> bool:
    return password_hash.startswith(BCRYPT_HASH_PREFIXES)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str, password_salt: str) -> bool:

    if _is_bcrypt_hash(password_hash):
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"),
                password_hash.encode("utf-8"),
            )
        except ValueError:
            return False


    legacy_hash = hashlib.sha256(f"{password_salt}:{password}".encode("utf-8")).hexdigest()
    return secrets.compare_digest(legacy_hash, password_hash)


def _generate_password(length: int = PASSWORD_LEN) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _issue_auth_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    created_at = now.isoformat(timespec="seconds")
    expires_at = (now + timedelta(days=TOKEN_TTL_DAYS)).isoformat(timespec="seconds")
    token_hash = _hash_token(token)

    with _db_conn() as conn:
        conn.execute(
            "DELETE FROM auth_tokens WHERE expires_at <= ?",
            (created_at,),
        )
        conn.execute(
            """
            INSERT INTO auth_tokens (token_hash, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token_hash, user_id, created_at, expires_at),
        )

    return token


def _lookup_user_by_token(token: str) -> Optional[dict[str, object]]:
    token_hash = _hash_token(token)
    now = _utc_now_iso()
    with _db_conn() as conn:
        row = conn.execute(
            """
            SELECT t.user_id, u.username, t.expires_at
            FROM auth_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
        if row is None:
            return None
        if str(row["expires_at"]) <= now:
            conn.execute(
                "DELETE FROM auth_tokens WHERE token_hash = ?",
                (token_hash,),
            )
            return None

    return {
        "user_id": int(row["user_id"]),
        "username": str(row["username"]),
    }


def _validate_username(raw_username: str) -> str:
    username = raw_username.strip()
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(
            400,
            _msg("username_invalid"),
        )
    return username


def _log_operation(
    *,
    user_id: int,
    event_type: str,
    payload: dict,
    session_id: Optional[str] = None,
) -> None:
    with _db_conn() as conn:
        conn.execute(
            """
            INSERT INTO operation_logs (user_id, session_id, event_type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                session_id,
                event_type,
                json.dumps(payload, ensure_ascii=False),
                _utc_now_iso(),
            ),
        )

# ---------------------------------------------------------------------------
# Data loading (in-memory at startup)
# ---------------------------------------------------------------------------
DATA_PATH = os.path.expanduser(
    os.getenv("DATA_PATH", "~/data/workspace/finance/data_history/XAUUSD_1M.parquet")
)

print(f"[boot] Using sqlite db: {DB_PATH}")
print(f"[boot] Loading 1-minute history: {DATA_PATH}")
_raw = pd.read_parquet(DATA_PATH)
df_1m: pd.DataFrame = (
    _raw[["time", "open", "high", "low", "close", "tick_volume"]]
    .copy()
    .assign(time=lambda x: pd.to_datetime(x["time"]))
    .sort_values("time")
    .set_index("time")
)
del _raw
print(f"[boot] Data loaded: {len(df_1m):,} rows, "
      f"range {df_1m.index.min()} -> {df_1m.index.max()}")

HISTORY_BUFFER_BARS = 5000
FUTURE_BUFFER_BARS = 10000

VALID_START_IDX = HISTORY_BUFFER_BARS
VALID_END_IDX = len(df_1m) - FUTURE_BUFFER_BARS

if VALID_END_IDX <= VALID_START_IDX:
    raise RuntimeError(
        _msg("insufficient_history", required=HISTORY_BUFFER_BARS + FUTURE_BUFFER_BARS)
    )

_init_db()

# ---------------------------------------------------------------------------
# Session model
# ---------------------------------------------------------------------------
class GameSession:
    """Single game session state for one user."""

    def __init__(
        self,
        session_id: str,
        user_id: int,
        username: str,
        initial_balance: float,
        start_time: pd.Timestamp,
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.username = username
        self.balance: float = initial_balance
        self.initial_balance: float = initial_balance

        self.current_time: pd.Timestamp = start_time
        self.trades_used: int = 0
        self.trade_history: list[dict] = []
        self.game_over: bool = False
        self.game_over_reason: str = ""

sessions: dict[str, GameSession] = {}

# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class AuthLoginRequest(BaseModel):
    username: str = Field(..., description="Username: 3-24 chars (letters/numbers/underscore)")
    password: Optional[str] = Field(default=None, description="Password is required for existing users")


class StartGameRequest(BaseModel):
    initial_balance: float = Field(default=10000.0, ge=10, description="Initial balance (minimum $10)")

class StepRequest(BaseModel):
    session_id: str
    step_minutes: int = Field(..., description="Step minutes: 1/5/15/60")

class OrderRequest(BaseModel):
    session_id: str
    direction: str = Field(..., description="Trade side: Buy or Sell")
    lot_size: float = Field(..., ge=0.01, description="Lot size (minimum 0.01)")
    sl: float = Field(..., description="Stop-loss price (Bid coordinate)")
    tp: float = Field(..., description="Take-profit price (Bid coordinate)")

# ---------------------------------------------------------------------------
# Core utility functions
# ---------------------------------------------------------------------------

def _get_bid_at(current_time: pd.Timestamp) -> float:
    """Get Bid price at a specific timestamp (chart close price)."""
    try:
        val = df_1m.loc[current_time, "close"]
        return float(val)  # type: ignore[arg-type]
    except KeyError:

        pos = int(df_1m.index.get_indexer([current_time], method="ffill")[0])
        if pos < 0:
            raise ValueError(_msg("time_before_data_start", time=current_time))
        return float(df_1m.iloc[pos]["close"])


def _build_bar(ts: pd.Timestamp, row: pd.Series) -> dict:
    """Convert a DataFrame row into frontend bar payload."""
    return {
        "time": int(ts.timestamp()),
        "open":   round(float(row["open"]),         2),
        "high":   round(float(row["high"]),         2),
        "low":    round(float(row["low"]),          2),
        "close":  round(float(row["close"]),        2),
        "volume": int(row["tick_volume"]),
    }


def get_klines(current_time: pd.Timestamp, timeframe: str, limit: int = 300) -> list[dict]:
    """
    Anti-cheat kline builder.
    Resamples from 1M base data and strictly returns bars <= current_time.
    """
    rule = TIMEFRAME_RULES.get(timeframe, "1min")


    slice_df = df_1m.loc[:current_time]
    if slice_df.empty:
        return []


    ohlcv = slice_df.resample(rule).agg(
        open=("open",        "first"),
        high=("high",        "max"),
        low=("low",          "min"),
        close=("close",      "last"),
        tick_volume=("tick_volume", "sum"),
    ).dropna(subset=["open"])


    ohlcv = ohlcv.tail(limit)

    return [_build_bar(ts, row) for ts, row in ohlcv.iterrows()]


def _extract_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(401, _msg("auth_required"))
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(401, _msg("auth_header_invalid"))
    return parts[1].strip()


def _require_user(authorization: Optional[str]) -> dict[str, object]:
    token = _extract_token(authorization)
    user = _lookup_user_by_token(token)
    if user is None:
        raise HTTPException(401, _msg("auth_expired"))
    return user


def _create_game_session_record(session: GameSession) -> None:
    now = _utc_now_iso()
    with _db_conn() as conn:
        conn.execute(
            """
            INSERT INTO game_sessions (
                session_id, user_id, initial_balance, current_balance,
                start_time, current_time, trades_used, game_over,
                game_over_reason, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session.session_id,
                session.user_id,
                session.initial_balance,
                session.balance,
                session.current_time.isoformat(),
                session.current_time.isoformat(),
                session.trades_used,
                1 if session.game_over else 0,
                session.game_over_reason,
                now,
                now,
            ),
        )


def _update_game_session_record(session: GameSession) -> None:
    with _db_conn() as conn:
        conn.execute(
            """
            UPDATE game_sessions
            SET current_balance = ?,
                current_time = ?,
                trades_used = ?,
                game_over = ?,
                game_over_reason = ?,
                updated_at = ?
            WHERE session_id = ?
            """,
            (
                session.balance,
                session.current_time.isoformat(),
                session.trades_used,
                1 if session.game_over else 0,
                session.game_over_reason,
                _utc_now_iso(),
                session.session_id,
            ),
        )


def _insert_trade_record(session: GameSession, trade_record: dict) -> None:
    with _db_conn() as conn:
        conn.execute(
            """
            INSERT INTO trades (
                session_id, user_id, trade_no, direction, lot_size,
                entry_time, close_time, entry_price, close_price,
                sl, tp, pnl, close_reason, balance_before, balance_after, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session.session_id,
                session.user_id,
                trade_record["id"],
                trade_record["direction"],
                trade_record["lot_size"],
                trade_record["entry_time"],
                trade_record["close_time"],
                trade_record["entry_price"],
                trade_record["close_price"],
                trade_record["sl"],
                trade_record["tp"],
                trade_record["pnl"],
                trade_record["close_reason"],
                trade_record["balance_before"],
                trade_record["balance_after"],
                _utc_now_iso(),
            ),
        )


def _insert_step_record(
    *,
    user_id: int,
    session_id: str,
    from_time: pd.Timestamp,
    to_time: pd.Timestamp,
    step_minutes: int,
) -> None:
    with _db_conn() as conn:
        conn.execute(
            """
            INSERT INTO step_events (
                session_id, user_id, from_time, to_time, step_minutes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                user_id,
                from_time.isoformat(),
                to_time.isoformat(),
                step_minutes,
                _utc_now_iso(),
            ),
        )


def _compute_user_stats(user_id: int, username: str) -> dict:
    with _db_conn() as conn:
        trade_rows = conn.execute(
            """
            SELECT pnl, balance_before
            FROM trades
            WHERE user_id = ?
            ORDER BY id ASC
            """,
            (user_id,),
        ).fetchall()
        session_count = conn.execute(
            "SELECT COUNT(1) AS cnt FROM game_sessions WHERE user_id = ?",
            (user_id,),
        ).fetchone()["cnt"]

    total_trades = len(trade_rows)
    wins = sum(1 for r in trade_rows if float(r["pnl"]) > 0)
    losses = sum(1 for r in trade_rows if float(r["pnl"]) < 0)
    total_pnl = round(sum(float(r["pnl"]) for r in trade_rows), 2)
    win_rate = round((wins / total_trades) * 100, 2) if total_trades > 0 else 0.0

    returns: list[float] = []
    for row in trade_rows:
        balance_before = float(row["balance_before"])
        if balance_before > 0:
            returns.append(float(row["pnl"]) / balance_before)

    sharpe = 0.0
    if len(returns) >= 2:
        arr = np.array(returns, dtype=float)
        std = float(arr.std(ddof=1))
        if std > 0:
            sharpe = float(arr.mean() / std * np.sqrt(len(arr)))
    sharpe = round(sharpe, 4)

    return {
        "username": username,
        "sessions": int(session_count),
        "total_trades": total_trades,
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "total_pnl": total_pnl,
        "sharpe": sharpe,
    }


def _build_leaderboard(sort_by: str, limit: int) -> list[dict]:
    if sort_by not in {"win_rate", "sharpe", "total_pnl"}:
        raise HTTPException(400, _msg("sort_by_invalid"))

    with _db_conn() as conn:
        users = conn.execute(
            """
            SELECT id, username
            FROM users
            ORDER BY id ASC
            """
        ).fetchall()

    rows = [
        _compute_user_stats(int(u["id"]), str(u["username"]))
        for u in users
    ]

    rows.sort(
        key=lambda r: (float(r[sort_by]), float(r["total_pnl"]), int(r["total_trades"])),
        reverse=True,
    )

    top_rows = rows[:limit]
    for idx, row in enumerate(top_rows, start=1):
        row["rank"] = idx
    return top_rows


# ---------------------------------------------------------------------------
# Settlement engine
# ---------------------------------------------------------------------------

def fast_forward_order(
    session: GameSession,
    direction: str,
    lot_size: float,
    sl: float,
    tp: float,
) -> dict:
    """
    Fast-forward order settlement on 1M bars.
    Starts from the minute after entry and scans until SL/TP/stop-out/data-end.
    Uses Bid chart prices with Ask = Bid + SPREAD.
    """
    entry_time = session.current_time
    balance_before = session.balance
    bid_at_entry = _get_bid_at(entry_time)


    if direction == "Buy":
        entry_price = round(bid_at_entry + SPREAD, 2)
    else:
        entry_price = round(bid_at_entry, 2)


    used_margin = lot_size * MARGIN_REQUIRED_PER_LOT



    future_df = df_1m.loc[entry_time:].iloc[1:]

    if future_df.empty:
        raise HTTPException(status_code=400, detail=_msg("data_end_no_fast_forward"))

    close_price: float = 0.0
    close_time: pd.Timestamp = entry_time
    close_reason: str = "data_end"

    for ts, bar in future_df.iterrows():
        low  = float(bar["low"])
        high = float(bar["high"])




        if direction == "Buy":
            worst_price = low
            worst_pnl = (worst_price - entry_price) * lot_size * CONTRACT_SIZE
        else:
            worst_price = high + SPREAD
            worst_pnl = (entry_price - worst_price) * lot_size * CONTRACT_SIZE

        equity_worst = balance_before + worst_pnl
        margin_ratio = (equity_worst / used_margin) * 100.0

        if margin_ratio <= STOP_OUT_RATIO_PCT:

            close_price = worst_price
            close_time  = ts
            close_reason = "stop_out"
            break


        if direction == "Buy":

            if low <= sl:
                close_price  = sl
                close_time   = ts
                close_reason = "sl"
                break

            if high >= tp:
                close_price  = tp
                close_time   = ts
                close_reason = "tp"
                break
        else:

            if high + SPREAD >= sl:
                close_price  = sl
                close_time   = ts
                close_reason = "sl"
                break

            if low + SPREAD <= tp:
                close_price  = tp
                close_time   = ts
                close_reason = "tp"
                break


    if close_reason == "data_end":
        last_bar    = future_df.iloc[-1]
        close_price = float(last_bar["close"])
        close_time  = future_df.index[-1]  # type: ignore[assignment]




    if direction == "Buy":
        pnl = (close_price - entry_price) * lot_size * CONTRACT_SIZE
    else:
        pnl = (entry_price - close_price) * lot_size * CONTRACT_SIZE

    pnl = round(pnl, 2)


    session.balance      = round(balance_before + pnl, 2)
    session.current_time = close_time
    session.trades_used += 1

    trade_record = {
        "id":           len(session.trade_history) + 1,
        "direction":    direction,
        "lot_size":     lot_size,
        "entry_time":   entry_time.isoformat(),
        "close_time":   close_time.isoformat(),
        "entry_price":  entry_price,
        "close_price":  round(close_price, 2),
        "sl":           sl,
        "tp":           tp,
        "pnl":          pnl,
        "close_reason": close_reason,
        "balance_before": round(balance_before, 2),
        "balance_after": round(session.balance, 2),
    }
    session.trade_history.append(trade_record)


    if close_reason == "stop_out" or session.balance <= 0:
        session.game_over        = True
        session.game_over_reason = "stop_out"
    elif close_reason == "data_end":
        session.game_over        = True
        session.game_over_reason = "data_end"
    elif session.trades_used >= MAX_TRADES:
        session.game_over        = True
        session.game_over_reason = "max_trades"

    return {
        "trade":            trade_record,
        "balance":          session.balance,
        "trades_used":      session.trades_used,
        "current_time":     close_time.isoformat(),
        "game_over":        session.game_over,
        "game_over_reason": session.game_over_reason,
    }


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.post("/api/auth/login")
def auth_login(req: AuthLoginRequest):
    username = _validate_username(req.username)
    now = _utc_now_iso()
    created = False
    generated_password: Optional[str] = None

    with _db_conn() as conn:
        row = conn.execute(
            """
            SELECT id, username, password_hash, password_salt
            FROM users
            WHERE username = ?
            """,
            (username,),
        ).fetchone()

        if row is None:
            created = True
            generated_password = _generate_password()
            pwd_hash = _hash_password(generated_password)
            cur = conn.execute(
                """
                INSERT INTO users (username, password_hash, password_salt, created_at, last_login_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, pwd_hash, "bcrypt", now, now),
            )
            user_id = int(cur.lastrowid)
        else:
            if not req.password:
                raise HTTPException(400, _msg("username_exists_password_required"))
            real_hash = str(row["password_hash"])
            salt = str(row["password_salt"])
            if not _verify_password(req.password, real_hash, salt):
                raise HTTPException(401, _msg("invalid_credentials"))
            user_id = int(row["id"])
            if _is_bcrypt_hash(real_hash):
                conn.execute(
                    "UPDATE users SET last_login_at = ? WHERE id = ?",
                    (now, user_id),
                )
            else:

                upgraded_hash = _hash_password(req.password)
                conn.execute(
                    """
                    UPDATE users
                    SET password_hash = ?, password_salt = ?, last_login_at = ?
                    WHERE id = ?
                    """,
                    (upgraded_hash, "bcrypt", now, user_id),
                )

    token = _issue_auth_token(user_id)

    _log_operation(
        user_id=user_id,
        event_type="auth_login",
        payload={"created": created, "username": username},
    )

    payload = {
        "token": token,
        "username": username,
        "created": created,
    }
    if generated_password is not None:
        payload["generated_password"] = generated_password
    return payload


@app.get("/api/auth/me")
def auth_me(authorization: Optional[str] = Header(default=None)):
    user = _require_user(authorization)
    return {
        "username": str(user["username"]),
    }


@app.get("/api/stats/me")
def my_stats(authorization: Optional[str] = Header(default=None)):
    user = _require_user(authorization)
    return _compute_user_stats(int(user["user_id"]), str(user["username"]))


@app.get("/api/leaderboard")
def leaderboard(
    sort_by: str = "total_pnl",
    limit: int = 50,
    authorization: Optional[str] = Header(default=None),
):
    _require_user(authorization)
    if limit < 1 or limit > 200:
        raise HTTPException(400, _msg("limit_out_of_range"))
    return {
        "sort_by": sort_by,
        "rows": _build_leaderboard(sort_by, limit),
    }


@app.post("/api/game/start")
def start_game(
    req: StartGameRequest,
    authorization: Optional[str] = Header(default=None),
):
    """Start a new game from a random valid timestamp."""
    user = _require_user(authorization)
    user_id = int(user["user_id"])
    username = str(user["username"])


    random_idx = int(np.random.randint(VALID_START_IDX, VALID_END_IDX))
    start_time: pd.Timestamp = df_1m.index[random_idx]  # type: ignore[assignment]

    session_id = str(uuid.uuid4())
    session = GameSession(
        session_id=session_id,
        user_id=user_id,
        username=username,
        initial_balance=req.initial_balance,
        start_time=start_time,
    )
    sessions[session_id] = session
    _create_game_session_record(session)

    bid = _get_bid_at(start_time)

    _log_operation(
        user_id=user_id,
        session_id=session_id,
        event_type="game_start",
        payload={
            "initial_balance": req.initial_balance,
            "start_time": start_time.isoformat(),
        },
    )

    return {
        "session_id":      session_id,
        "initial_balance": req.initial_balance,
        "current_time":    start_time.isoformat(),
        "trades_used":     0,
        "max_trades":      MAX_TRADES,
        "current_price": {
            "bid": round(bid, 2),
            "ask": round(bid + SPREAD, 2),
        },
    }


@app.get("/api/market/klines")
def get_market_klines(
    session_id: str,
    timeframe: str = "1H",
    limit: int = 300,
    authorization: Optional[str] = Header(default=None),
):
    """Get historical K-lines for a session, strictly up to current_time."""
    user = _require_user(authorization)
    session = _require_session(session_id, int(user["user_id"]))

    if timeframe not in TIMEFRAME_RULES:
        raise HTTPException(
            400,
            _msg("timeframe_unsupported", timeframe=timeframe, choices=list(TIMEFRAME_RULES.keys())),
        )

    klines = get_klines(session.current_time, timeframe, limit)
    bid = _get_bid_at(session.current_time)

    return {
        "timeframe":    timeframe,
        "current_time": session.current_time.isoformat(),
        "klines":       klines,
        "current_price": {
            "bid": round(bid, 2),
            "ask": round(bid + SPREAD, 2),
        },
    }


@app.post("/api/game/step")
def step_game(
    req: StepRequest,
    authorization: Optional[str] = Header(default=None),
):
    """Advance session time and return incremental 1M bars."""
    user = _require_user(authorization)
    user_id = int(user["user_id"])
    session = _require_session(req.session_id, user_id)

    if session.game_over:
        raise HTTPException(400, _msg("game_over_cannot_step"))

    if req.step_minutes not in (1, 5, 15, 60):
        raise HTTPException(400, _msg("step_minutes_invalid"))

    from_time = session.current_time
    target_time: pd.Timestamp = session.current_time + pd.Timedelta(minutes=req.step_minutes)  # type: ignore[operator]
    max_time: pd.Timestamp = df_1m.index.max()  # type: ignore[assignment]


    if target_time >= max_time:
        new_time = max_time
        session.game_over = True
        session.game_over_reason = "data_end"
    else:
        new_time = target_time


    step_df = df_1m.loc[session.current_time:new_time].iloc[1:]
    new_bars = [_build_bar(ts, row) for ts, row in step_df.iterrows()]

    session.current_time = new_time
    _insert_step_record(
        user_id=user_id,
        session_id=session.session_id,
        from_time=from_time,
        to_time=new_time,
        step_minutes=req.step_minutes,
    )
    _update_game_session_record(session)
    _log_operation(
        user_id=user_id,
        session_id=session.session_id,
        event_type="step",
        payload={
            "from_time": from_time.isoformat(),
            "to_time": new_time.isoformat(),
            "step_minutes": req.step_minutes,
            "game_over": session.game_over,
            "game_over_reason": session.game_over_reason,
        },
    )

    bid = _get_bid_at(new_time)

    return {
        "current_time": new_time.isoformat(),
        "new_bars":     new_bars,
        "game_over":    session.game_over,
        "game_over_reason": session.game_over_reason,
        "current_price": {
            "bid": round(bid, 2),
            "ask": round(bid + SPREAD, 2),
        },
    }


@app.post("/api/trade/order")
def place_order(
    req: OrderRequest,
    authorization: Optional[str] = Header(default=None),
):
    """Place an order and perform backend fast-forward settlement."""
    user = _require_user(authorization)
    user_id = int(user["user_id"])
    session = _require_session(req.session_id, user_id)

    if session.game_over:
        raise HTTPException(400, _msg("game_over"))

    if session.trades_used >= MAX_TRADES:
        raise HTTPException(400, _msg("trades_exhausted", max_trades=MAX_TRADES))

    if req.direction not in ("Buy", "Sell"):
        raise HTTPException(400, _msg("direction_invalid"))


    required_margin = req.lot_size * MARGIN_REQUIRED_PER_LOT
    if session.balance < required_margin:
        raise HTTPException(
            400,
            _msg("margin_insufficient", required=required_margin, balance=session.balance),
        )


    bid = _get_bid_at(session.current_time)
    if req.direction == "Buy":
        if req.sl > bid - MIN_SLTP_DISTANCE_USD:
            raise HTTPException(
                400,
                _msg("buy_sl_min_distance", bid=bid, dist=MIN_SLTP_DISTANCE_USD),
            )
        if req.tp < bid + MIN_SLTP_DISTANCE_USD:
            raise HTTPException(
                400,
                _msg("buy_tp_min_distance", bid=bid, dist=MIN_SLTP_DISTANCE_USD),
            )
        entry = bid + SPREAD
        if req.sl >= entry:
            raise HTTPException(400, _msg("buy_sl_below_entry", sl=req.sl, entry=entry))
        if req.tp <= entry:
            raise HTTPException(400, _msg("buy_tp_above_entry", tp=req.tp, entry=entry))
    else:
        if req.sl < bid + MIN_SLTP_DISTANCE_USD:
            raise HTTPException(
                400,
                _msg("sell_sl_min_distance", bid=bid, dist=MIN_SLTP_DISTANCE_USD),
            )
        if req.tp > bid - MIN_SLTP_DISTANCE_USD:
            raise HTTPException(
                400,
                _msg("sell_tp_min_distance", bid=bid, dist=MIN_SLTP_DISTANCE_USD),
            )
        entry = bid
        if req.sl <= entry:
            raise HTTPException(400, _msg("sell_sl_above_entry", sl=req.sl, entry=entry))
        if req.tp >= entry:
            raise HTTPException(400, _msg("sell_tp_below_entry", tp=req.tp, entry=entry))

    result = fast_forward_order(session, req.direction, req.lot_size, req.sl, req.tp)
    _insert_trade_record(session, result["trade"])
    _update_game_session_record(session)
    _log_operation(
        user_id=user_id,
        session_id=session.session_id,
        event_type="order",
        payload={
            "direction": req.direction,
            "lot_size": req.lot_size,
            "sl": req.sl,
            "tp": req.tp,
            "result": result,
        },
    )
    return result


@app.get("/api/game/session/{session_id}")
def get_session_state(
    session_id: str,
    authorization: Optional[str] = Header(default=None),
):
    """Get full session state including trade history."""
    user = _require_user(authorization)
    session = _require_session(session_id, int(user["user_id"]))
    bid = _get_bid_at(session.current_time)

    return {
        "session_id":       session_id,
        "balance":          session.balance,
        "initial_balance":  session.initial_balance,
        "current_time":     session.current_time.isoformat(),
        "trades_used":      session.trades_used,
        "max_trades":       MAX_TRADES,
        "trade_history":    session.trade_history,
        "game_over":        session.game_over,
        "game_over_reason": session.game_over_reason,
        "current_price": {
            "bid": round(bid, 2),
            "ask": round(bid + SPREAD, 2),
        },
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_trade_history_from_db(session_id: str) -> list[dict]:
    with _db_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                trade_no,
                direction,
                lot_size,
                entry_time,
                close_time,
                entry_price,
                close_price,
                sl,
                tp,
                pnl,
                close_reason,
                balance_before,
                balance_after
            FROM trades
            WHERE session_id = ?
            ORDER BY trade_no ASC, id ASC
            """,
            (session_id,),
        ).fetchall()

    history: list[dict] = []
    for row in rows:
        history.append(
            {
                "id": int(row["trade_no"]),
                "direction": str(row["direction"]),
                "lot_size": float(row["lot_size"]),
                "entry_time": str(row["entry_time"]),
                "close_time": str(row["close_time"]),
                "entry_price": float(row["entry_price"]),
                "close_price": float(row["close_price"]),
                "sl": float(row["sl"]),
                "tp": float(row["tp"]),
                "pnl": float(row["pnl"]),
                "close_reason": str(row["close_reason"]),
                "balance_before": float(row["balance_before"]),
                "balance_after": float(row["balance_after"]),
            }
        )
    return history


def _load_session_from_db(session_id: str) -> Optional[GameSession]:
    with _db_conn() as conn:
        row = conn.execute(
            """
            SELECT
                gs.session_id,
                gs.user_id,
                u.username,
                gs.initial_balance,
                gs.current_balance,
                gs.start_time,
                gs.current_time,
                gs.trades_used,
                gs.game_over,
                gs.game_over_reason
            FROM game_sessions gs
            JOIN users u ON u.id = gs.user_id
            WHERE gs.session_id = ?
            """,
            (session_id,),
        ).fetchone()

    if row is None:
        return None

    session = GameSession(
        session_id=str(row["session_id"]),
        user_id=int(row["user_id"]),
        username=str(row["username"]),
        initial_balance=float(row["initial_balance"]),
        start_time=pd.Timestamp(str(row["start_time"])),
    )
    session.balance = float(row["current_balance"])
    session.current_time = pd.Timestamp(str(row["current_time"]))
    session.trades_used = int(row["trades_used"])
    session.game_over = bool(int(row["game_over"]))
    session.game_over_reason = str(row["game_over_reason"] or "")
    session.trade_history = _load_trade_history_from_db(session_id)
    return session


def _require_session(session_id: str, user_id: Optional[int] = None) -> GameSession:
    """Get session by id; optionally validate ownership by user_id."""
    if session_id not in sessions:
        session = _load_session_from_db(session_id)
        if session is None:
            raise HTTPException(404, _msg("session_missing_or_expired", session_id=session_id))
        sessions[session_id] = session
    session = sessions[session_id]
    if user_id is not None and session.user_id != user_id:
        raise HTTPException(403, _msg("session_forbidden"))
    return session


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
