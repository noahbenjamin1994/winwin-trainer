'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Chart from '@/components/Chart'
import type { ChartRef } from '@/components/Chart'
import Header from '@/components/Header'
import StepControls from '@/components/StepControls'
import TradePanel from '@/components/TradePanel'
import TradeHistory from '@/components/TradeHistory'
import GameOver from '@/components/GameOver'
import * as api from '@/lib/api'
import type {
  GameSession,
  LeaderboardRow,
  LeaderboardSort,
  PriceTick,
  Timeframe,
  UserStats,
} from '@/lib/types'

const AUTH_TOKEN_KEY = 'xauusd_trainer_token'

type AuthState = {
  username: string
  token: string
}

type OrderLevels = { sl: number; tp: number } | null

function AuthScreen({ onAuthed }: { onAuthed: (auth: AuthState) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [pendingAuth, setPendingAuth] = useState<AuthState | null>(null)
  const [copyText, setCopyText] = useState('复制密码')

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const res = await api.login(username, password)
      const auth = { username: res.username, token: res.token }
      if (res.created && res.generated_password) {
        setGeneratedPassword(res.generated_password)
        setPendingAuth(auth)
      } else {
        onAuthed(auth)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function copyPassword() {
    if (!generatedPassword) return
    try {
      await navigator.clipboard.writeText(generatedPassword)
      setCopyText('已复制')
      window.setTimeout(() => setCopyText('复制密码'), 1200)
    } catch {
      setCopyText('复制失败')
      window.setTimeout(() => setCopyText('复制密码'), 1200)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0d1117] px-4 py-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-[#30363d] bg-[#161b22] p-6">
        <div className="text-center">
          <div className="mb-1 text-3xl font-bold tracking-widest text-[#f0b429]">XAUUSD</div>
          <div className="text-sm text-[#8b949e]">登录 / 注册</div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[#8b949e]">用户名</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-white focus:border-[#f0b429] focus:outline-none"
              placeholder="3-24 位字母/数字/下划线"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8b949e]">密码（已有用户必填）</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-white focus:border-[#f0b429] focus:outline-none"
              placeholder="新用户可留空自动生成"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
        </div>

        {error && (
          <div className="rounded bg-[#ef5350]/10 px-3 py-2 text-xs text-[#ef5350]">{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-lg bg-[#f0b429] py-3 text-sm font-bold text-black transition-colors hover:bg-[#f0b429]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '处理中…' : '登录 / 注册'}
        </button>

        {generatedPassword && pendingAuth && (
          <div className="space-y-3 rounded border border-[#26a69a]/50 bg-[#26a69a]/10 p-3">
            <div className="text-xs text-[#8b949e]">
              已为新用户生成唯一登录密码，请立即保存（建议截图）。
            </div>
            <div className="rounded bg-[#0d1117] px-3 py-2 font-mono text-lg text-[#26a69a]">
              {generatedPassword}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyPassword}
                className="flex-1 rounded border border-[#26a69a] py-2 text-xs text-[#26a69a] hover:bg-[#26a69a]/10"
              >
                {copyText}
              </button>
              <button
                onClick={() => onAuthed(pendingAuth)}
                className="flex-1 rounded bg-[#26a69a] py-2 text-xs font-bold text-white hover:opacity-90"
              >
                我已保存，继续
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LobbyScreen({
  username,
  stats,
  leaderboard,
  leaderboardSort,
  loadingBoard,
  onSortChange,
  onRefreshBoard,
  onLogout,
  onStart,
}: {
  username: string
  stats: UserStats | null
  leaderboard: LeaderboardRow[]
  leaderboardSort: LeaderboardSort
  loadingBoard: boolean
  onSortChange: (v: LeaderboardSort) => void
  onRefreshBoard: () => void
  onLogout: () => void
  onStart: (balance: number) => void
}) {
  const [balance, setBalance] = useState('10000')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleStart() {
    const val = parseFloat(balance)
    if (isNaN(val) || val < 10) {
      setError('最小初始本金 $10')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onStart(val)
    } catch (e) {
      setError(String(e))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3">
          <div>
            <div className="text-base font-bold text-[#f0b429]">XAUUSD 训练大厅</div>
            <div className="text-xs text-[#8b949e]">当前用户：{username}</div>
          </div>
          <button
            onClick={onLogout}
            className="rounded border border-[#30363d] px-3 py-1.5 text-xs text-[#8b949e] hover:border-[#f0b429] hover:text-[#f0b429]"
          >
            退出登录
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
          <div className="space-y-4 rounded-xl border border-[#30363d] bg-[#161b22] p-5">
            <div className="text-sm font-bold text-white">开始新训练</div>
            <div>
              <label className="mb-1 block text-xs text-[#8b949e]">初始本金（USD）</label>
              <input
                type="number"
                min="10"
                step="10"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStart()}
                className="w-full rounded border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-lg text-white focus:border-[#f0b429] focus:outline-none"
              />
            </div>

            <div className="space-y-0.5 text-xs text-[#8b949e]">
              <div>• 每局最多 10 次开仓</div>
              <div>• 下单后自动快进至结果</div>
              <div>• 达到强平线会结束本局</div>
            </div>

            {error && (
              <div className="rounded bg-[#ef5350]/10 px-3 py-2 text-xs text-[#ef5350]">{error}</div>
            )}

            <button
              onClick={handleStart}
              disabled={loading}
              className="w-full rounded-lg bg-[#f0b429] py-3 text-sm font-bold text-black transition-colors hover:bg-[#f0b429]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '正在初始化…' : '开始训练'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold text-white">我的历史统计</div>
                <button
                  onClick={onRefreshBoard}
                  className="rounded border border-[#30363d] px-2 py-1 text-[11px] text-[#8b949e] hover:border-[#f0b429] hover:text-[#f0b429]"
                >
                  刷新
                </button>
              </div>
              {stats ? (
                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <div className="rounded bg-[#0d1117] p-2">
                    <div className="text-[#8b949e]">总交易</div>
                    <div className="font-mono font-bold text-white">{stats.total_trades}</div>
                  </div>
                  <div className="rounded bg-[#0d1117] p-2">
                    <div className="text-[#8b949e]">胜率</div>
                    <div className="font-mono font-bold text-[#26a69a]">{stats.win_rate.toFixed(2)}%</div>
                  </div>
                  <div className="rounded bg-[#0d1117] p-2">
                    <div className="text-[#8b949e]">夏普</div>
                    <div className="font-mono font-bold text-white">{stats.sharpe.toFixed(4)}</div>
                  </div>
                  <div className="rounded bg-[#0d1117] p-2">
                    <div className="text-[#8b949e]">历史盈利</div>
                    <div className={`font-mono font-bold ${stats.total_pnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                      {stats.total_pnl >= 0 ? '+' : ''}{stats.total_pnl.toFixed(2)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#8b949e]">暂无统计数据</div>
              )}
            </div>

            <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="mr-2 text-sm font-bold text-white">世界排行榜</div>
                {[
                  { key: 'win_rate', label: '按胜率' },
                  { key: 'sharpe', label: '按夏普' },
                  { key: 'total_pnl', label: '按盈利' },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => onSortChange(item.key as LeaderboardSort)}
                    className={`
                      rounded px-2 py-1 text-[11px]
                      ${leaderboardSort === item.key
                        ? 'bg-[#f0b429] font-bold text-black'
                        : 'bg-[#0d1117] text-[#8b949e] hover:text-white'
                      }
                    `}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {loadingBoard ? (
                <div className="text-xs text-[#8b949e]">加载中…</div>
              ) : leaderboard.length === 0 ? (
                <div className="text-xs text-[#8b949e]">暂无排行榜数据</div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-[620px] w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#30363d] text-[#8b949e]">
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">用户</th>
                        <th className="px-2 py-1 text-right">胜率</th>
                        <th className="px-2 py-1 text-right">夏普</th>
                        <th className="px-2 py-1 text-right">历史盈利</th>
                        <th className="px-2 py-1 text-right">总交易</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map(row => (
                        <tr key={`${row.rank}-${row.username}`} className="border-b border-[#21262d]">
                          <td className="px-2 py-1 text-white">{row.rank}</td>
                          <td className="px-2 py-1 text-white">{row.username}</td>
                          <td className="px-2 py-1 text-right text-[#26a69a]">{row.win_rate.toFixed(2)}%</td>
                          <td className="px-2 py-1 text-right text-white">{row.sharpe.toFixed(4)}</td>
                          <td className={`px-2 py-1 text-right ${row.total_pnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                            {row.total_pnl >= 0 ? '+' : ''}{row.total_pnl.toFixed(2)}
                          </td>
                          <td className="px-2 py-1 text-right text-white">{row.total_trades}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [authLoading, setAuthLoading] = useState(true)
  const [auth, setAuth] = useState<AuthState | null>(null)

  const [stats, setStats] = useState<UserStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>('total_pnl')
  const [dashboardLoading, setDashboardLoading] = useState(false)

  const [session, setSession] = useState<GameSession | null>(null)
  const [currentPrice, setCurrentPrice] = useState<PriceTick | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1H')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tradePanelResetToken, setTradePanelResetToken] = useState(0)
  const [orderLevels, setOrderLevels] = useState<OrderLevels>(null)

  const chartRef = useRef<ChartRef>(null)

  const refreshDashboard = useCallback(async () => {
    if (!auth) return
    setDashboardLoading(true)
    try {
      const [myStats, board] = await Promise.all([
        api.getMyStats(),
        api.getLeaderboard(leaderboardSort, 30),
      ])
      setStats(myStats)
      setLeaderboard(board.rows)
    } catch {
      // 静默失败，避免打断主流程
    } finally {
      setDashboardLoading(false)
    }
  }, [auth, leaderboardSort])

  useEffect(() => {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) {
      setAuthLoading(false)
      return
    }
    api.setAuthToken(token)
    api.me()
      .then(res => {
        setAuth({ username: res.username, token })
      })
      .catch(() => {
        window.localStorage.removeItem(AUTH_TOKEN_KEY)
        api.setAuthToken(null)
        setAuth(null)
      })
      .finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    if (!auth) {
      setStats(null)
      setLeaderboard([])
      return
    }
    refreshDashboard()
  }, [auth, refreshDashboard])

  const handleAuthed = useCallback((nextAuth: AuthState) => {
    api.setAuthToken(nextAuth.token)
    window.localStorage.setItem(AUTH_TOKEN_KEY, nextAuth.token)
    setAuth(nextAuth)
    setSession(null)
    setCurrentPrice(null)
    setError('')
  }, [])

  const handleLogout = useCallback(() => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY)
    api.setAuthToken(null)
    setAuth(null)
    setSession(null)
    setCurrentPrice(null)
    setOrderLevels(null)
    setStats(null)
    setLeaderboard([])
    setError('')
  }, [])

  const handleStart = useCallback(async (initialBalance: number) => {
    setLoading(true)
    setError('')
    setOrderLevels(null)
    try {
      const data = await api.startGame(initialBalance)
      const sess: GameSession = {
        session_id: data.session_id,
        initial_balance: data.initial_balance,
        balance: data.initial_balance,
        current_time: data.current_time,
        trades_used: 0,
        max_trades: data.max_trades,
        trade_history: [],
        game_over: false,
        game_over_reason: '',
        current_price: data.current_price,
      }
      setSession(sess)
      setCurrentPrice(data.current_price)
      const klinesRes = await api.getKlines(data.session_id, '1H', 300)
      chartRef.current?.setData(klinesRes.klines)
    } catch (e) {
      setError(String(e))
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLevelsChange = useCallback((levels: OrderLevels) => {
    setOrderLevels(levels)
  }, [])

  const handleTimeframeChange = useCallback(async (tf: Timeframe) => {
    if (!session) return
    setTimeframe(tf)
    setLoading(true)
    setError('')
    try {
      const res = await api.getKlines(session.session_id, tf, 300)
      chartRef.current?.setData(res.klines)
      setCurrentPrice(res.current_price)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [session])

  const handleStep = useCallback(async (minutes: 1 | 5 | 15 | 60) => {
    if (!session) return
    setLoading(true)
    setError('')
    try {
      const res = await api.stepGame(session.session_id, minutes)
      setSession(prev => prev ? {
        ...prev,
        current_time: res.current_time,
        game_over: res.game_over,
        game_over_reason: res.game_over_reason,
      } : null)
      setCurrentPrice(res.current_price)
      setTradePanelResetToken(prev => prev + 1)
      if (res.game_over) {
        setOrderLevels(null)
        refreshDashboard()
      }

      if (timeframe === '1M') {
        chartRef.current?.updateBars(res.new_bars)
      } else {
        const klinesRes = await api.getKlines(session.session_id, timeframe, 300)
        chartRef.current?.setData(klinesRes.klines)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [session, timeframe, refreshDashboard])

  const handleOrder = useCallback(async (
    direction: 'Buy' | 'Sell',
    lotSize: number,
    sl: number,
    tp: number,
  ) => {
    if (!session) return
    setLoading(true)
    setError('')
    try {
      const res = await api.placeOrder({
        session_id: session.session_id,
        direction,
        lot_size: lotSize,
        sl,
        tp,
      })

      setSession(prev => {
        if (!prev) return null
        return {
          ...prev,
          balance: res.balance,
          trades_used: res.trades_used,
          current_time: res.current_time,
          trade_history: [...prev.trade_history, res.trade],
          game_over: res.game_over,
          game_over_reason: res.game_over_reason,
        }
      })

      const klinesRes = await api.getKlines(session.session_id, timeframe, 300)
      chartRef.current?.setData(klinesRes.klines)
      setCurrentPrice(klinesRes.current_price)
      setTradePanelResetToken(prev => prev + 1)
      if (res.game_over) {
        setOrderLevels(null)
        refreshDashboard()
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [session, timeframe, refreshDashboard])

  const handleRestart = useCallback(() => {
    setSession(null)
    setCurrentPrice(null)
    setTimeframe('1H')
    setError('')
    setOrderLevels(null)
    refreshDashboard()
  }, [refreshDashboard])

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d1117] text-sm text-[#8b949e]">
        正在检查登录状态…
      </div>
    )
  }

  if (!auth) {
    return <AuthScreen onAuthed={handleAuthed} />
  }

  if (!session) {
    return (
      <LobbyScreen
        username={auth.username}
        stats={stats}
        leaderboard={leaderboard}
        leaderboardSort={leaderboardSort}
        loadingBoard={dashboardLoading}
        onSortChange={setLeaderboardSort}
        onRefreshBoard={refreshDashboard}
        onLogout={handleLogout}
        onStart={handleStart}
      />
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-y-auto bg-[#0d1117] md:h-screen md:overflow-hidden">
      <Header session={session} currentPrice={currentPrice} />

      {error && (
        <div className="border-b border-[#ef5350]/30 bg-[#ef5350]/10 px-4 py-1.5 text-xs text-[#ef5350]">
          ⚠ {error}
          <button className="ml-3 underline" onClick={() => setError('')}>关闭</button>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex h-[46dvh] min-h-[300px] flex-col overflow-hidden lg:h-auto lg:flex-1">
          <Chart
            ref={chartRef}
            timeframe={timeframe}
            orderLevels={orderLevels}
            onTimeframeChange={handleTimeframeChange}
          />
        </div>

        <div className="w-full shrink-0 border-t border-[#21262d] lg:w-72 lg:border-l lg:border-t-0 lg:overflow-y-auto">
          <TradePanel
            sessionId={session.session_id}
            currentPrice={currentPrice}
            resetToken={tradePanelResetToken}
            disabled={session.game_over || session.trades_used >= session.max_trades}
            loading={loading}
            onLevelsChange={handleLevelsChange}
            onOrder={handleOrder}
          />
        </div>
      </div>

      <StepControls
        disabled={session.game_over}
        loading={loading}
        onStep={handleStep}
      />

      <div className="h-56 shrink-0 lg:h-40">
        <TradeHistory trades={session.trade_history} />
      </div>

      {session.game_over && (
        <GameOver
          reason={session.game_over_reason}
          initialBalance={session.initial_balance}
          finalBalance={session.balance}
          trades={session.trade_history}
          onRestart={handleRestart}
        />
      )}
    </div>
  )
}
