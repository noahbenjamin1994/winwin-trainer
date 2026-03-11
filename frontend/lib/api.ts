/**
 * API 客户端
 * 封装所有与后端通信的函数，统一错误处理
 */

import axios from 'axios'
import type {
  GameSession,
  KlinesResponse,
  OrderRequest,
  OrderResponse,
  StepResponse,
  Timeframe,
} from './types'

const http = axios.create({
  baseURL: '',  // 使用 Next.js rewrites 代理到后端
  timeout: 30000,
})

/** 错误消息提取 */
function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message
  }
  return String(err)
}

/** 开始新游戏 */
export async function startGame(initialBalance: number): Promise<GameSession> {
  try {
    const res = await http.post('/api/game/start', { initial_balance: initialBalance })
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** 获取 K 线数据（防作弊：严格截止 current_time） */
export async function getKlines(
  sessionId: string,
  timeframe: Timeframe,
  limit = 300,
): Promise<KlinesResponse> {
  try {
    const res = await http.get('/api/market/klines', {
      params: { session_id: sessionId, timeframe, limit },
    })
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** 时间步进推演 */
export async function stepGame(
  sessionId: string,
  stepMinutes: 1 | 5 | 15 | 60,
): Promise<StepResponse> {
  try {
    const res = await http.post('/api/game/step', {
      session_id: sessionId,
      step_minutes: stepMinutes,
    })
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** 下单（触发后端快进结算） */
export async function placeOrder(req: OrderRequest): Promise<OrderResponse> {
  try {
    const res = await http.post('/api/trade/order', req)
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** 获取 Session 完整状态 */
export async function getSession(sessionId: string): Promise<GameSession> {
  try {
    const res = await http.get(`/api/game/session/${sessionId}`)
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}
