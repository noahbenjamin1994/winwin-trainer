"""
XAUUSD 黄金 CFD 盘感训练系统 —— FastAPI 后端
================================================================
合约规格：
  - 品种：XAUUSD（黄金/美元）
  - 合约大小：1手 = 100 盎司
  - 固定点差：20 points = $0.20（Bid/Ask 之差）
  - 最小手数：0.01 手，步进 0.01
  - 杠杆：1:100（用于爆仓计算保证金）
  - 每局游戏：最多 10 次开仓机会

防作弊核心原则：
  所有K线数据严格截止到 session 的 current_time，
  绝对不返回未来数据。
"""

import os
import uuid
import json
import re
import secrets
import sqlite3
import string
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ─────────────────────────────────────────────────────────────
# 应用初始化
# ─────────────────────────────────────────────────────────────
app = FastAPI(title="XAUUSD Training System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# 常量定义
# ─────────────────────────────────────────────────────────────
SPREAD: float = 0.20          # 固定点差 $0.20（20 points）
CONTRACT_SIZE: int = 100       # 1手 = 100 盎司
MAX_TRADES: int = 10           # 每局最多开仓次数
LEVERAGE: int = 100            # 杠杆比例
MARGIN_REQUIRED_PER_LOT: float = 1000.0  # 金荣中国规则：伦敦金 1 手保证金 $1000
MARGIN_CALL_RATIO_PCT: float = 100.0     # <=100% 追加保证金（当前系统仅用于判定，不单独通知）
STOP_OUT_RATIO_PCT: float = 30.0         # <=30% 强平

DB_PATH = str(Path(__file__).resolve().parent / "trainer.db")
auth_tokens: dict[str, dict[str, object]] = {}

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,24}$")
PASSWORD_LEN = 6

# pandas resample 规则映射
TIMEFRAME_RULES: dict[str, str] = {
    "1M":  "1min",
    "5M":  "5min",
    "15M": "15min",
    "1H":  "1h",
    "4H":  "4h",
    "1D":  "1D",
}


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

            CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON game_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_steps_user_id ON step_events(user_id);
            """
        )


def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()


def _generate_password(length: int = PASSWORD_LEN) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _validate_username(raw_username: str) -> str:
    username = raw_username.strip()
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(
            400,
            "用户名仅支持 3-24 位字母/数字/下划线",
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

# ─────────────────────────────────────────────────────────────
# 数据加载（服务启动时一次性加载到内存，驻留全程）
# ─────────────────────────────────────────────────────────────
DATA_PATH = os.path.expanduser(
    "~/data/workspace/finance/data_history/XAUUSD_1M.parquet"
)

print(f"[启动] 正在加载1分钟历史数据: {DATA_PATH}")
_raw = pd.read_parquet(DATA_PATH)
# 以 time 列作为 DatetimeIndex，便于切片和 resample
df_1m: pd.DataFrame = (
    _raw[["time", "open", "high", "low", "close", "tick_volume"]]
    .copy()
    .assign(time=lambda x: pd.to_datetime(x["time"]))
    .sort_values("time")
    .set_index("time")
)
del _raw
print(f"[启动] 数据加载完成：{len(df_1m):,} 行，"
      f"时间范围 {df_1m.index.min()} → {df_1m.index.max()}")

# 预计算有效随机入场范围：
#   - 前 5000 根：需要足够的历史K线供图表显示
#   - 后 10000 根：需要足够的未来数据供快进结算（较原先提升 1 倍）
HISTORY_BUFFER_BARS = 5000
FUTURE_BUFFER_BARS = 10000

VALID_START_IDX = HISTORY_BUFFER_BARS
VALID_END_IDX = len(df_1m) - FUTURE_BUFFER_BARS

if VALID_END_IDX <= VALID_START_IDX:
    raise RuntimeError(
        "历史数据不足：请确保数据行数大于 "
        f"{HISTORY_BUFFER_BARS + FUTURE_BUFFER_BARS}"
    )

_init_db()

# ─────────────────────────────────────────────────────────────
# 游戏 Session 数据结构
# ─────────────────────────────────────────────────────────────
class GameSession:
    """单个用户游戏会话，含完整游戏状态"""

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
        # current_time：玩家当前"看到"的最新时间点（防作弊边界）
        self.current_time: pd.Timestamp = start_time
        self.trades_used: int = 0
        self.trade_history: list[dict] = []
        self.game_over: bool = False
        self.game_over_reason: str = ""

# 内存中的 Session 字典（生产环境可替换为 Redis/SQLite）
sessions: dict[str, GameSession] = {}

# ─────────────────────────────────────────────────────────────
# Pydantic 请求模型
# ─────────────────────────────────────────────────────────────
class AuthLoginRequest(BaseModel):
    username: str = Field(..., description="用户名，3-24 位字母/数字/下划线")
    password: Optional[str] = Field(default=None, description="已有用户必须填写密码")


class StartGameRequest(BaseModel):
    initial_balance: float = Field(default=10000.0, ge=10, description="初始本金（最小$10）")

class StepRequest(BaseModel):
    session_id: str
    step_minutes: int = Field(..., description="步进分钟数：1/5/15/60")

class OrderRequest(BaseModel):
    session_id: str
    direction: str = Field(..., description="交易方向：Buy 或 Sell")
    lot_size: float = Field(..., ge=0.01, description="手数（最小0.01手）")
    sl: float = Field(..., description="止损价格（Bid价格坐标系）")
    tp: float = Field(..., description="止盈价格（Bid价格坐标系）")

# ─────────────────────────────────────────────────────────────
# 核心工具函数
# ─────────────────────────────────────────────────────────────

def _get_bid_at(current_time: pd.Timestamp) -> float:
    """获取指定时间点的 Bid 价格（即图表收盘价）"""
    try:
        val = df_1m.loc[current_time, "close"]
        return float(val)  # type: ignore[arg-type]
    except KeyError:
        # 找到最近的左侧数据行
        pos = int(df_1m.index.get_indexer([current_time], method="ffill")[0])
        if pos < 0:
            raise ValueError(f"时间 {current_time} 早于数据起始时间")
        return float(df_1m.iloc[pos]["close"])


def _build_bar(ts: pd.Timestamp, row: pd.Series) -> dict:
    """将 DataFrame 行构造为前端图表所需的 Bar 格式"""
    return {
        "time": int(ts.timestamp()),    # Unix 时间戳（秒）
        "open":   round(float(row["open"]),         2),
        "high":   round(float(row["high"]),         2),
        "low":    round(float(row["low"]),          2),
        "close":  round(float(row["close"]),        2),
        "volume": int(row["tick_volume"]),
    }


def get_klines(current_time: pd.Timestamp, timeframe: str, limit: int = 300) -> list[dict]:
    """
    防作弊 K 线生成函数
    ─────────────────────────────────────────────
    从 1M 原始数据动态 resample，严格只返回 current_time
    之前（含）的数据。limit 控制最多返回多少根K线。
    """
    rule = TIMEFRAME_RULES.get(timeframe, "1min")

    # 关键防作弊切片：loc[:current_time] 包含 current_time 这一行
    slice_df = df_1m.loc[:current_time]
    if slice_df.empty:
        return []

    # 动态重采样：open=第一根, high=最大, low=最小, close=最后一根
    ohlcv = slice_df.resample(rule).agg(
        open=("open",        "first"),
        high=("high",        "max"),
        low=("low",          "min"),
        close=("close",      "last"),
        tick_volume=("tick_volume", "sum"),
    ).dropna(subset=["open"])  # 删除无数据周期

    # 只取最近 limit 根，避免一次传输过多数据
    ohlcv = ohlcv.tail(limit)

    return [_build_bar(ts, row) for ts, row in ohlcv.iterrows()]


def _extract_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(401, "未登录，请先登录")
    parts = authorization.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(401, "Authorization 格式错误，需使用 Bearer Token")
    return parts[1].strip()


def _require_user(authorization: Optional[str]) -> dict[str, object]:
    token = _extract_token(authorization)
    if token not in auth_tokens:
        raise HTTPException(401, "登录已失效，请重新登录")
    return auth_tokens[token]


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
        raise HTTPException(400, "sort_by 只支持 win_rate / sharpe / total_pnl")

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


# ─────────────────────────────────────────────────────────────
# 核心引擎：快进结算（Fast-Forward）
# ─────────────────────────────────────────────────────────────

def fast_forward_order(
    session: GameSession,
    direction: str,
    lot_size: float,
    sl: float,
    tp: float,
) -> dict:
    """
    订单快进结算引擎
    ─────────────────────────────────────────────
    从 current_time 的下一分钟起，在 1M K 线上逐行遍历，
    检查 SL/TP 触发或爆仓条件，直到平仓为止。

    价格体系说明（MT5 惯例）：
      - K 线价格（open/high/low/close）= Bid 价格
      - Ask 价格 = Bid + SPREAD（$0.20）
      - 做多(Buy)  开仓价 = Ask = Bid + SPREAD
      - 做空(Sell) 开仓价 = Bid
      - 所有 SL/TP 均以 Bid 价格坐标输入

    SL/TP 触发逻辑：
      做多：
        - SL 触发：该分钟 Low（Bid）<= sl_price  → 以 sl_price 成交
        - TP 触发：该分钟 High（Bid）>= tp_price → 以 tp_price 成交
      做空：
        - SL 触发：该分钟 High（Bid）+ SPREAD >= sl_price → 以 sl_price 成交
        - TP 触发：该分钟 Low（Bid）+ SPREAD <= tp_price  → 以 tp_price 成交

    强平逻辑（按保证金比例）：
      保证金比例 = 净值 / 占用保证金 * 100%
      当比例 <= 30% 时触发 stop_out 强平。

    Returns:
      包含交易结果的字典，供 API 直接返回
    """
    entry_time = session.current_time
    balance_before = session.balance
    bid_at_entry = _get_bid_at(entry_time)

    # ── 计算入场价（含点差）──
    if direction == "Buy":
        entry_price = round(bid_at_entry + SPREAD, 2)  # Ask 价
    else:
        entry_price = round(bid_at_entry, 2)            # Bid 价

    # 本笔持仓占用保证金（伦敦金：1手=$1000）
    used_margin = lot_size * MARGIN_REQUIRED_PER_LOT

    # ── 从下一分钟开始快进 ──
    # iloc[1:] 跳过 entry_time 所在的行，从下一根K线开始检查
    future_df = df_1m.loc[entry_time:].iloc[1:]

    if future_df.empty:
        raise HTTPException(status_code=400, detail="数据已到末尾，无法继续快进")

    close_price: float = 0.0
    close_time: pd.Timestamp = entry_time  # 默认值，下方会被覆盖
    close_reason: str = "data_end"

    for ts, bar in future_df.iterrows():
        low  = float(bar["low"])
        high = float(bar["high"])

        # ──── 保证金强平检查（优先级最高）────
        # 以当分钟最不利价格估算净值与保证金比例：
        # 保证金比例 = 净值 / 占用保证金 * 100%
        if direction == "Buy":
            worst_price = low                  # 多单最坏是价格跌到最低
            worst_pnl = (worst_price - entry_price) * lot_size * CONTRACT_SIZE
        else:
            worst_price = high + SPREAD        # 空单最坏是价格涨到最高（Ask）
            worst_pnl = (entry_price - worst_price) * lot_size * CONTRACT_SIZE

        equity_worst = balance_before + worst_pnl
        margin_ratio = (equity_worst / used_margin) * 100.0

        if margin_ratio <= STOP_OUT_RATIO_PCT:
            # 触发强平：以最坏价格平仓
            close_price = worst_price
            close_time  = ts
            close_reason = "stop_out"
            break

        # ──── SL/TP 触发检查 ────
        if direction == "Buy":
            # 多单：K线的 Low（Bid）触及止损
            if low <= sl:
                close_price  = sl
                close_time   = ts
                close_reason = "sl"
                break
            # 多单：K线的 High（Bid）触及止盈
            if high >= tp:
                close_price  = tp
                close_time   = ts
                close_reason = "tp"
                break
        else:
            # 空单：K线的 High + SPREAD（Ask）触及止损
            if high + SPREAD >= sl:
                close_price  = sl
                close_time   = ts
                close_reason = "sl"
                break
            # 空单：K线的 Low + SPREAD（Ask）触及止盈
            if low + SPREAD <= tp:
                close_price  = tp
                close_time   = ts
                close_reason = "tp"
                break

    # 数据耗尽未触发 SL/TP：以最后一根收盘价强制平仓（close_reason 已初始化为 "data_end"）
    if close_reason == "data_end":
        last_bar    = future_df.iloc[-1]
        close_price = float(last_bar["close"])
        close_time  = future_df.index[-1]  # type: ignore[assignment]

    # ── 盈亏计算 ──
    # 多单：(平仓Bid - 开仓Ask) * 手数 * 合约大小
    # 空单：(开仓Bid - 平仓Ask) * 手数 * 合约大小
    if direction == "Buy":
        pnl = (close_price - entry_price) * lot_size * CONTRACT_SIZE
    else:
        pnl = (entry_price - close_price) * lot_size * CONTRACT_SIZE

    pnl = round(pnl, 2)

    # ── 更新 Session 状态 ──
    session.balance      = round(balance_before + pnl, 2)
    session.current_time = close_time                    # 时间游标拨到平仓时间
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

    # ── 检查游戏结束条件 ──
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


# ─────────────────────────────────────────────────────────────
# API 端点
# ─────────────────────────────────────────────────────────────

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
            salt = secrets.token_hex(8)
            pwd_hash = _hash_password(generated_password, salt)
            cur = conn.execute(
                """
                INSERT INTO users (username, password_hash, password_salt, created_at, last_login_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, pwd_hash, salt, now, now),
            )
            user_id = int(cur.lastrowid)
        else:
            if not req.password:
                raise HTTPException(400, "该用户名已存在，请输入密码")
            real_hash = str(row["password_hash"])
            salt = str(row["password_salt"])
            if _hash_password(req.password, salt) != real_hash:
                raise HTTPException(401, "用户名或密码错误")
            user_id = int(row["id"])
            conn.execute(
                "UPDATE users SET last_login_at = ? WHERE id = ?",
                (now, user_id),
            )

    token = secrets.token_urlsafe(32)
    auth_tokens[token] = {"user_id": user_id, "username": username}

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
        raise HTTPException(400, "limit 取值范围为 1-200")
    return {
        "sort_by": sort_by,
        "rows": _build_leaderboard(sort_by, limit),
    }


@app.post("/api/game/start")
def start_game(
    req: StartGameRequest,
    authorization: Optional[str] = Header(default=None),
):
    """
    开始新游戏
    ──────────
    随机从历史数据中选取一个时间点作为游戏起始时间，
    返回 session_id 供后续所有 API 使用。
    """
    user = _require_user(authorization)
    user_id = int(user["user_id"])
    username = str(user["username"])

    # 随机选取有效时间点（确保前后都有足够数据）
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
    """
    获取历史 K 线数据（防作弊核心接口）
    ────────────────────────────────────
    严格只返回 session.current_time 之前（含）的 K 线，
    绝对不泄露未来数据。支持动态 resample 多周期。
    """
    user = _require_user(authorization)
    session = _require_session(session_id, int(user["user_id"]))

    if timeframe not in TIMEFRAME_RULES:
        raise HTTPException(400, f"不支持的周期: {timeframe}，"
                                 f"可选: {list(TIMEFRAME_RULES.keys())}")

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
    """
    时间推演（步进）
    ─────────────────
    将该 session 的 current_time 向前推进 step_minutes 分钟。
    返回这段时间内新增的 1M K 线（增量数据），
    供前端图表平滑 update 而无需重载全量数据。
    """
    user = _require_user(authorization)
    user_id = int(user["user_id"])
    session = _require_session(req.session_id, user_id)

    if session.game_over:
        raise HTTPException(400, "游戏已结束，无法继续推演")

    if req.step_minutes not in (1, 5, 15, 60):
        raise HTTPException(400, "step_minutes 只支持 1/5/15/60")

    from_time = session.current_time
    target_time: pd.Timestamp = session.current_time + pd.Timedelta(minutes=req.step_minutes)  # type: ignore[operator]
    max_time: pd.Timestamp = df_1m.index.max()  # type: ignore[assignment]

    # 到达数据末尾视为正常结束，不再抛错
    if target_time >= max_time:
        new_time = max_time
        session.game_over = True
        session.game_over_reason = "data_end"
    else:
        new_time = target_time

    # 获取本次步进新增的 1M K 线（排除当前时间那根，只取新增部分）
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
    """
    下单并触发快进结算
    ───────────────────
    接收订单参数后，在后端 1M 数据上执行快进结算，
    直到 SL/TP/强平触发为止，然后返回交易结果。
    """
    user = _require_user(authorization)
    user_id = int(user["user_id"])
    session = _require_session(req.session_id, user_id)

    if session.game_over:
        raise HTTPException(400, "游戏已结束")

    if session.trades_used >= MAX_TRADES:
        raise HTTPException(400, f"已用完全部 {MAX_TRADES} 次交易机会")

    if req.direction not in ("Buy", "Sell"):
        raise HTTPException(400, "direction 必须为 Buy 或 Sell")

    # ── 开仓保证金校验（1手=$1000）──
    required_margin = req.lot_size * MARGIN_REQUIRED_PER_LOT
    if session.balance < required_margin:
        raise HTTPException(
            400,
            "保证金不足："
            f"开仓需要 ${required_margin:.2f}，"
            f"当前余额 ${session.balance:.2f}"
        )

    # ── 验证 SL/TP 合理性 ──
    bid = _get_bid_at(session.current_time)
    if req.direction == "Buy":
        entry = bid + SPREAD
        if req.sl >= entry:
            raise HTTPException(400, f"多单止损({req.sl:.2f})必须低于入场价({entry:.2f})")
        if req.tp <= entry:
            raise HTTPException(400, f"多单止盈({req.tp:.2f})必须高于入场价({entry:.2f})")
    else:
        entry = bid
        if req.sl <= entry:
            raise HTTPException(400, f"空单止损({req.sl:.2f})必须高于入场价({entry:.2f})")
        if req.tp >= entry:
            raise HTTPException(400, f"空单止盈({req.tp:.2f})必须低于入场价({entry:.2f})")

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
    """获取当前游戏完整状态（含交易历史）"""
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


# ─────────────────────────────────────────────────────────────
# 内部辅助函数
# ─────────────────────────────────────────────────────────────

def _require_session(session_id: str, user_id: Optional[int] = None) -> GameSession:
    """查找 Session，不存在则抛 404；user_id 不为空时校验归属"""
    if session_id not in sessions:
        raise HTTPException(404, f"Session {session_id!r} 不存在或已过期")
    session = sessions[session_id]
    if user_id is not None and session.user_id != user_id:
        raise HTTPException(403, "无权访问该 Session")
    return session


# ─────────────────────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
