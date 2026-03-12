/**
 * API 客户端
 * 封装所有与后端通信的函数，统一错误处理
 */

import axios from 'axios'
import type {
  AuthLoginResponse,
  AuthMeResponse,
  GameSession,
  KlinesResponse,
  LeaderboardResponse,
  LeaderboardSort,
  OrderRequest,
  OrderResponse,
  StepResponse,
  Timeframe,
  UserStats,
} from './types'

const http = axios.create({
  baseURL: '',  // 使用 Next.js rewrites 代理到后端
  timeout: 30000,
})

let authToken: string | null = null

http.interceptors.request.use(config => {
  if (authToken) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${authToken}`
  }
  return config
})

/** 设置/清除登录 token */
export function setAuthToken(token: string | null) {
  authToken = token
}

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

/** 用户登录（不存在则自动创建并返回一次性密码） */
export async function login(username: string, password?: string): Promise<AuthLoginResponse> {
  try {
    const res = await http.post('/api/auth/login', {
      username,
      password: password && password.length > 0 ? password : undefined,
    })
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** 校验当前 token */
export async function me(): Promise<AuthMeResponse> {
  try {
    const res = await http.get('/api/auth/me')
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** 当前用户统计 */
export async function getMyStats(): Promise<UserStats> {
  try {
    const res = await http.get('/api/stats/me')
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** 世界排行榜 */
export async function getLeaderboard(
  sortBy: LeaderboardSort,
  limit = 20,
): Promise<LeaderboardResponse> {
  try {
    const res = await http.get('/api/leaderboard', {
      params: { sort_by: sortBy, limit },
    })
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
