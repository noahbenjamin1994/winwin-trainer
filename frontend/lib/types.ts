// ================================================================
// Shared frontend type definitions
// ================================================================

/** Game session state */
export interface GameSession {
  session_id: string
  initial_balance: number
  balance: number
  current_time: string
  trades_used: number
  max_trades: number
  trade_history: TradeRecord[]
  game_over: boolean
  game_over_reason: string
  current_price: PriceTick
}

/** Current market price (Bid/Ask) */
export interface PriceTick {
  bid: number
  ask: number
}

/** OHLC bar format used by lightweight-charts */
export interface OHLCBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Closed trade record */
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

/** Order request payload */
export interface OrderRequest {
  session_id: string
  direction: 'Buy' | 'Sell'
  lot_size: number
  sl: number
  tp: number
}

/** Order response payload */
export interface OrderResponse {
  trade: TradeRecord
  balance: number
  trades_used: number
  current_time: string
  game_over: boolean
  game_over_reason: string
}

/** Step response payload */
export interface StepResponse {
  current_time: string
  new_bars: OHLCBar[]
  game_over: boolean
  game_over_reason: string
  current_price: PriceTick
}

/** K-line query response payload */
export interface KlinesResponse {
  timeframe: string
  current_time: string
  klines: OHLCBar[]
  current_price: PriceTick
}

export type Timeframe = '1M' | '5M' | '15M' | '1H' | '4H' | '1D'

export interface AuthLoginResponse {
  token: string
  username: string
  created: boolean
  generated_password?: string
}

export interface AuthMeResponse {
  username: string
}

export interface UserStats {
  username: string
  sessions: number
  total_trades: number
  wins: number
  losses: number
  win_rate: number
  total_pnl: number
  sharpe: number
}

export type LeaderboardSort = 'win_rate' | 'sharpe' | 'total_pnl'

export interface LeaderboardRow extends UserStats {
  rank: number
}

export interface LeaderboardResponse {
  sort_by: LeaderboardSort
  rows: LeaderboardRow[]
}
