/**
 * API client
 * Wraps backend calls with consistent error handling.
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
import { type Lang, translateBackendError } from './i18n'

const http = axios.create({
  baseURL: '',
  timeout: 30000,
})

let authToken: string | null = null
let apiLang: Lang = 'zh'

http.interceptors.request.use(config => {
  if (authToken) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${authToken}`
  }
  config.headers = config.headers ?? {}
  config.headers['Accept-Language'] = apiLang
  return config
})

/** Set or clear auth token */
export function setAuthToken(token: string | null) {
  authToken = token
}

export function setApiLanguage(lang: Lang) {
  apiLang = lang
}

/** Extract and normalize API error message */
function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const raw = String(err.response?.data?.detail ?? err.message)
    return translateBackendError(raw, apiLang)
  }
  return translateBackendError(String(err), apiLang)
}

/** Start a new game */
export async function startGame(initialBalance: number): Promise<GameSession> {
  try {
    const res = await http.post('/api/game/start', { initial_balance: initialBalance })
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** Login (auto-register new username and return one-time password) */
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

/** Verify current token */
export async function me(): Promise<AuthMeResponse> {
  try {
    const res = await http.get('/api/auth/me')
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** Current user statistics */
export async function getMyStats(): Promise<UserStats> {
  try {
    const res = await http.get('/api/stats/me')
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** Global leaderboard */
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

/** Fetch K-lines (anti-cheat: strictly up to current_time) */
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

/** Step time forward */
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

/** Place order (triggers backend fast-forward settlement) */
export async function placeOrder(req: OrderRequest): Promise<OrderResponse> {
  try {
    const res = await http.post('/api/trade/order', req)
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}

/** Get full session state */
export async function getSession(sessionId: string): Promise<GameSession> {
  try {
    const res = await http.get(`/api/game/session/${sessionId}`)
    return res.data
  } catch (err) {
    throw new Error(extractError(err))
  }
}
