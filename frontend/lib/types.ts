// ================================================================
// 全局类型定义
// ================================================================

/** 游戏 Session 状态 */
export interface GameSession {
  session_id: string
  initial_balance: number
  balance: number
  current_time: string         // ISO 8601 格式
  trades_used: number
  max_trades: number           // 固定 10
  trade_history: TradeRecord[]
  game_over: boolean
  game_over_reason: string
  current_price: PriceTick
}

/** 当前价格（Bid/Ask） */
export interface PriceTick {
  bid: number
  ask: number
}

/** lightweight-charts 需要的 K 线格式 */
export interface OHLCBar {
  time: number   // Unix 时间戳（秒）
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** 已完成的交易记录 */
export interface TradeRecord {
  id: number
  direction: 'Buy' | 'Sell'
  lot_size: number
  entry_time: string
  close_time: string
  entry_price: number
  close_price: number
  sl: number
  tp: number
  pnl: number
  close_reason: 'sl' | 'tp' | 'stop_out' | 'data_end'
}

/** 下单请求 */
export interface OrderRequest {
  session_id: string
  direction: 'Buy' | 'Sell'
  lot_size: number
  sl: number
  tp: number
}

/** 下单响应 */
export interface OrderResponse {
  trade: TradeRecord
  balance: number
  trades_used: number
  current_time: string
  game_over: boolean
  game_over_reason: string
}

/** 步进响应 */
export interface StepResponse {
  current_time: string
  new_bars: OHLCBar[]
  game_over: boolean
  game_over_reason: string
  current_price: PriceTick
}

/** K 线查询响应 */
export interface KlinesResponse {
  timeframe: string
  current_time: string
  klines: OHLCBar[]
  current_price: PriceTick
}

export type Timeframe = '1M' | '5M' | '15M' | '1H' | '4H' | '1D'
