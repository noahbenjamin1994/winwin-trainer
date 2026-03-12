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
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
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

# pandas resample 规则映射
TIMEFRAME_RULES: dict[str, str] = {
    "1M":  "1min",
    "5M":  "5min",
    "15M": "15min",
    "1H":  "1h",
    "4H":  "4h",
    "1D":  "1D",
}

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

# ─────────────────────────────────────────────────────────────
# 游戏 Session 数据结构
# ─────────────────────────────────────────────────────────────
class GameSession:
    """单个用户游戏会话，含完整游戏状态"""

    def __init__(self, session_id: str, initial_balance: float,
                 start_time: pd.Timestamp):
        self.session_id = session_id
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

    爆仓逻辑：
      以该分钟最坏价格估算浮动盈亏，若 balance + float_pnl <= 0 则爆仓。

    Returns:
      包含交易结果的字典，供 API 直接返回
    """
    entry_time = session.current_time
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

        equity_worst = session.balance + worst_pnl
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
    session.balance      = round(session.balance + pnl, 2)
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

@app.post("/api/game/start")
def start_game(req: StartGameRequest):
    """
    开始新游戏
    ──────────
    随机从历史数据中选取一个时间点作为游戏起始时间，
    返回 session_id 供后续所有 API 使用。
    """
    # 随机选取有效时间点（确保前后都有足够数据）
    random_idx = int(np.random.randint(VALID_START_IDX, VALID_END_IDX))
    start_time: pd.Timestamp = df_1m.index[random_idx]  # type: ignore[assignment]

    session_id = str(uuid.uuid4())
    session    = GameSession(session_id, req.initial_balance, start_time)
    sessions[session_id] = session

    bid = _get_bid_at(start_time)

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
):
    """
    获取历史 K 线数据（防作弊核心接口）
    ────────────────────────────────────
    严格只返回 session.current_time 之前（含）的 K 线，
    绝对不泄露未来数据。支持动态 resample 多周期。
    """
    session = _require_session(session_id)

    if timeframe not in TIMEFRAME_RULES:
        raise HTTPException(400, f"不支持的周期: {timeframe}，"
                                 f"可选: {list(TIMEFRAME_RULES.keys())}")

    klines = get_klines(session.current_time, timeframe, limit)
    bid    = _get_bid_at(session.current_time)

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
def step_game(req: StepRequest):
    """
    时间推演（步进）
    ─────────────────
    将该 session 的 current_time 向前推进 step_minutes 分钟。
    返回这段时间内新增的 1M K 线（增量数据），
    供前端图表平滑 update 而无需重载全量数据。
    """
    session = _require_session(req.session_id)

    if session.game_over:
        raise HTTPException(400, "游戏已结束，无法继续推演")

    if req.step_minutes not in (1, 5, 15, 60):
        raise HTTPException(400, "step_minutes 只支持 1/5/15/60")

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
    # 注意：iloc[1:] 排除 current_time，防止重复推送
    step_df  = df_1m.loc[session.current_time:new_time].iloc[1:]
    new_bars = [_build_bar(ts, row) for ts, row in step_df.iterrows()]

    session.current_time = new_time
    bid = _get_bid_at(new_time)

    return {
        "current_time": new_time.isoformat(),
        "new_bars":     new_bars,               # 增量 1M K 线列表
        "game_over":    session.game_over,
        "game_over_reason": session.game_over_reason,
        "current_price": {
            "bid": round(bid, 2),
            "ask": round(bid + SPREAD, 2),
        },
    }


@app.post("/api/trade/order")
def place_order(req: OrderRequest):
    """
    下单并触发快进结算
    ───────────────────
    接收订单参数后，在后端 1M 数据上执行快进结算，
    直到 SL/TP 触发或爆仓为止，然后返回交易结果。
    """
    session = _require_session(req.session_id)

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

    # ── 执行快进结算 ──
    return fast_forward_order(session, req.direction, req.lot_size, req.sl, req.tp)


@app.get("/api/game/session/{session_id}")
def get_session_state(session_id: str):
    """获取当前游戏完整状态（含交易历史）"""
    session = _require_session(session_id)
    bid     = _get_bid_at(session.current_time)

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

def _require_session(session_id: str) -> GameSession:
    """查找 Session，不存在则抛 404"""
    if session_id not in sessions:
        raise HTTPException(404, f"Session {session_id!r} 不存在或已过期")
    return sessions[session_id]


# ─────────────────────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
