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
import { type Lang, normalizeLang, tr } from '@/lib/i18n'
import type {
  GameSession,
  LeaderboardRow,
  LeaderboardSort,
  PriceTick,
  TradeRecord,
  Timeframe,
  UserStats,
} from '@/lib/types'

const AUTH_TOKEN_KEY = 'xauusd_trainer_token'
const LANG_KEY = 'xauusd_trainer_lang'

type AuthState = {
  username: string
  token: string
}

type OrderLevels = { sl: number; tp: number } | null
type OrderFlashTone = 'win' | 'loss' | 'flat'
type OrderFlash = {
  emoji: string
  title: string
  pnlText: string
  reasonText: string
  tone: OrderFlashTone
}

function closeReasonText(reason: TradeRecord['close_reason'], lang: Lang): string {
  if (lang === 'zh') {
    if (reason === 'tp') return '止盈触发'
    if (reason === 'sl') return '止损触发'
    if (reason === 'stop_out') return '强平触发'
    return '数据结束'
  }
  if (reason === 'tp') return 'Take-profit hit'
  if (reason === 'sl') return 'Stop-loss hit'
  if (reason === 'stop_out') return 'Stop-out triggered'
  return 'Data end'
}

function buildOrderFlash(trade: TradeRecord, lang: Lang): OrderFlash {
  const pnl = trade.pnl
  const absPnlText = `${Math.abs(pnl).toFixed(2)} USD`

  if (pnl > 0) {
    return {
      emoji: pnl >= 50 ? '🚀' : '😎',
      title: lang === 'zh' ? '盈利落袋！' : 'Profit secured!',
      pnlText: `+${absPnlText}`,
      reasonText: closeReasonText(trade.close_reason, lang),
      tone: 'win',
    }
  }

  if (pnl < 0) {
    return {
      emoji: pnl <= -50 ? '💥' : '😵',
      title: lang === 'zh' ? '亏损一单，稳住节奏' : 'Loss taken. Reset.',
      pnlText: `-${absPnlText}`,
      reasonText: closeReasonText(trade.close_reason, lang),
      tone: 'loss',
    }
  }

  return {
    emoji: '😐',
    title: lang === 'zh' ? '这一单打平' : 'Flat close',
    pnlText: `±${absPnlText}`,
    reasonText: closeReasonText(trade.close_reason, lang),
    tone: 'flat',
  }
}

function LangSwitch({
  lang,
  onChange,
}: {
  lang: Lang
  onChange: (next: Lang) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-[#30363d] bg-[#0d1117]/90 p-1 text-[11px] shadow-[0_0_0_1px_rgba(240,180,41,0.08)]">
      <button
        className={`rounded-full px-2.5 py-0.5 transition-colors ${lang === 'zh' ? 'bg-[#f0b429] text-black font-bold' : 'text-[#8b949e] hover:text-white'}`}
        onClick={() => onChange('zh')}
      >
        {tr(lang, 'langZh')}
      </button>
      <button
        className={`rounded-full px-2.5 py-0.5 transition-colors ${lang === 'en' ? 'bg-[#f0b429] text-black font-bold' : 'text-[#8b949e] hover:text-white'}`}
        onClick={() => onChange('en')}
      >
        {tr(lang, 'langEn')}
      </button>
    </div>
  )
}

function AuthScreen({
  lang,
  onLangChange,
  onAuthed,
}: {
  lang: Lang
  onLangChange: (next: Lang) => void
  onAuthed: (auth: AuthState) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [pendingAuth, setPendingAuth] = useState<AuthState | null>(null)
  const [copyText, setCopyText] = useState(tr(lang, 'copyPassword'))

  useEffect(() => {
    setCopyText(tr(lang, 'copyPassword'))
  }, [lang])

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
      setCopyText(tr(lang, 'copied'))
      window.setTimeout(() => setCopyText(tr(lang, 'copyPassword')), 1200)
    } catch {
      setCopyText(tr(lang, 'copyFailed'))
      window.setTimeout(() => setCopyText(tr(lang, 'copyPassword')), 1200)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#0a0d12] px-4 py-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-120px] h-72 w-72 rounded-full bg-[#f0b429]/18 blur-3xl" />
        <div className="absolute right-[-140px] top-[20%] h-80 w-80 rounded-full bg-[#26a69a]/16 blur-3xl" />
        <div className="absolute bottom-[-140px] left-[30%] h-80 w-80 rounded-full bg-[#ef5350]/12 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-3xl border border-[#2b313d] bg-[#11161f]/85 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="grid lg:grid-cols-[1.25fr_0.95fr]">
          <div className="hidden lg:flex lg:flex-col lg:justify-between lg:border-r lg:border-[#21262d] lg:bg-[radial-gradient(circle_at_20%_15%,rgba(240,180,41,0.16),rgba(17,22,31,0)_40%),linear-gradient(180deg,rgba(22,27,34,0.8),rgba(13,17,23,0.8))] lg:p-10">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-[#8b949e]">Gold Trader Simulator</div>
              <div className="mt-4 text-5xl font-bold tracking-[0.18em] text-[#f0b429]">XAUUSD</div>
              <div className="mt-5 max-w-md text-sm leading-7 text-[#a8b3c2]">
                Build market intuition with strict anti-cheat historical replay.
                Every session starts at a random point. No future candles exposed.
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-[#2f3642] bg-[#0d1117]/70 p-3">
                <div className="font-mono text-lg font-bold text-[#f0b429]">10</div>
                <div className="mt-0.5 text-[#8b949e]">Max Trades</div>
              </div>
              <div className="rounded-xl border border-[#2f3642] bg-[#0d1117]/70 p-3">
                <div className="font-mono text-lg font-bold text-[#26a69a]">0.01</div>
                <div className="mt-0.5 text-[#8b949e]">Min Lot</div>
              </div>
              <div className="rounded-xl border border-[#2f3642] bg-[#0d1117]/70 p-3">
                <div className="font-mono text-lg font-bold text-[#ef5350]">$10</div>
                <div className="mt-0.5 text-[#8b949e]">Min Balance</div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold tracking-wide text-[#f0b429] lg:hidden">XAUUSD</div>
                <div className="text-xs text-[#8b949e]">{tr(lang, 'authTitle')}</div>
              </div>
              <LangSwitch lang={lang} onChange={onLangChange} />
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-[#8b949e]">{tr(lang, 'username')}</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-[#343d4a] bg-[#0d1117]/90 px-3.5 py-3 text-sm text-white outline-none transition-colors focus:border-[#f0b429]"
                  placeholder={tr(lang, 'usernamePlaceholder')}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-wider text-[#8b949e]">{tr(lang, 'password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#343d4a] bg-[#0d1117]/90 px-3.5 py-3 text-sm text-white outline-none transition-colors focus:border-[#f0b429]"
                  placeholder={tr(lang, 'passwordPlaceholder')}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-[#ef5350]/30 bg-[#ef5350]/12 px-3 py-2 text-xs text-[#ef5350]">{error}</div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[#f0b429] py-3 text-sm font-bold text-black transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? tr(lang, 'processing') : tr(lang, 'loginRegister')}
            </button>

            {generatedPassword && pendingAuth && (
              <div className="mt-5 space-y-3 rounded-xl border border-[#26a69a]/50 bg-[#26a69a]/10 p-3">
                <div className="text-xs text-[#8b949e]">
                  {tr(lang, 'generatedPasswordHint')}
                </div>
                <div className="rounded-lg border border-[#2f3642] bg-[#0d1117] px-3 py-2 font-mono text-lg text-[#26a69a]">
                  {generatedPassword}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={copyPassword}
                    className="flex-1 rounded-lg border border-[#26a69a] py-2 text-xs text-[#26a69a] hover:bg-[#26a69a]/10"
                  >
                    {copyText}
                  </button>
                  <button
                    onClick={() => onAuthed(pendingAuth)}
                    className="flex-1 rounded-lg bg-[#26a69a] py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    {tr(lang, 'savedContinue')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function LobbyScreen({
  lang,
  onLangChange,
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
  lang: Lang
  onLangChange: (next: Lang) => void
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
      setError(tr(lang, 'minInitialBalance', { min: 10 }))
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
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#090d13] px-4 py-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-80px] h-72 w-72 rounded-full bg-[#f0b429]/15 blur-3xl" />
        <div className="absolute right-[-120px] top-[10%] h-72 w-72 rounded-full bg-[#26a69a]/14 blur-3xl" />
        <div className="absolute bottom-[-120px] left-[35%] h-80 w-80 rounded-full bg-[#1f6feb]/12 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl space-y-5">
        <div className="rounded-2xl border border-[#2a313d] bg-[#121923]/90 p-4 shadow-[0_12px_48px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#8b949e]">Trading Arena</div>
              <div className="mt-1 text-xl font-bold text-[#f0b429]">{tr(lang, 'lobbyTitle')}</div>
              <div className="mt-1 text-xs text-[#8b949e]">{tr(lang, 'currentUser', { username })}</div>
            </div>
            <div className="flex items-center gap-2">
              <LangSwitch lang={lang} onChange={onLangChange} />
              <button
                onClick={onLogout}
                className="rounded-lg border border-[#3a434f] px-3 py-1.5 text-xs text-[#8b949e] transition-colors hover:border-[#f0b429] hover:text-[#f0b429]"
              >
                {tr(lang, 'logout')}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_1fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#2a313d] bg-[#121923]/90 p-5 shadow-[0_10px_36px_rgba(0,0,0,0.28)]">
              <div className="mb-4 text-sm font-bold text-white">{tr(lang, 'startTraining')}</div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-[#8b949e]">{tr(lang, 'initialBalanceUsd')}</label>
              <input
                type="number"
                min="10"
                step="10"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStart()}
                className="w-full rounded-xl border border-[#343d4a] bg-[#0d1117]/95 px-3.5 py-3 text-2xl text-white outline-none transition-colors focus:border-[#f0b429]"
              />

              <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-[#8b949e]">
                <div className="rounded-lg border border-[#2f3642] bg-[#0d1117]/70 px-2.5 py-2">{tr(lang, 'ruleMaxTrades')}</div>
                <div className="rounded-lg border border-[#2f3642] bg-[#0d1117]/70 px-2.5 py-2">{tr(lang, 'ruleAutoResult')}</div>
                <div className="rounded-lg border border-[#2f3642] bg-[#0d1117]/70 px-2.5 py-2">{tr(lang, 'ruleStopOut')}</div>
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-[#ef5350]/30 bg-[#ef5350]/12 px-3 py-2 text-xs text-[#ef5350]">{error}</div>
              )}

              <button
                onClick={handleStart}
                disabled={loading}
                className="mt-4 w-full rounded-xl bg-[#f0b429] py-3 text-sm font-bold text-black transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? tr(lang, 'initializing') : tr(lang, 'startNow')}
              </button>
            </div>

            <div className="rounded-2xl border border-[#2a313d] bg-[#121923]/90 p-5 shadow-[0_10px_36px_rgba(0,0,0,0.28)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold text-white">{tr(lang, 'myStats')}</div>
                <button
                  onClick={onRefreshBoard}
                  className="rounded-lg border border-[#3a434f] px-2.5 py-1 text-[11px] text-[#8b949e] transition-colors hover:border-[#f0b429] hover:text-[#f0b429]"
                >
                  {tr(lang, 'refresh')}
                </button>
              </div>
              {stats ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-[#2f3642] bg-[#0d1117]/80 p-3">
                    <div className="text-[#8b949e]">{tr(lang, 'statTotalTrades')}</div>
                    <div className="mt-1 font-mono text-lg font-bold text-white">{stats.total_trades}</div>
                  </div>
                  <div className="rounded-lg border border-[#2f3642] bg-[#0d1117]/80 p-3">
                    <div className="text-[#8b949e]">{tr(lang, 'statWinRate')}</div>
                    <div className="mt-1 font-mono text-lg font-bold text-[#26a69a]">{stats.win_rate.toFixed(2)}%</div>
                  </div>
                  <div className="rounded-lg border border-[#2f3642] bg-[#0d1117]/80 p-3">
                    <div className="text-[#8b949e]">{tr(lang, 'statSharpe')}</div>
                    <div className="mt-1 font-mono text-lg font-bold text-white">{stats.sharpe.toFixed(4)}</div>
                  </div>
                  <div className="rounded-lg border border-[#2f3642] bg-[#0d1117]/80 p-3">
                    <div className="text-[#8b949e]">{tr(lang, 'statPnl')}</div>
                    <div className={`mt-1 font-mono text-lg font-bold ${stats.total_pnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                      {stats.total_pnl >= 0 ? '+' : ''}{stats.total_pnl.toFixed(2)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#8b949e]">{tr(lang, 'noStats')}</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#2a313d] bg-[#121923]/90 p-5 shadow-[0_10px_36px_rgba(0,0,0,0.28)]">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="mr-2 text-sm font-bold text-white">{tr(lang, 'leaderboard')}</div>
              {[
                { key: 'win_rate', label: tr(lang, 'sortByWinRate') },
                { key: 'sharpe', label: tr(lang, 'sortBySharpe') },
                { key: 'total_pnl', label: tr(lang, 'sortByPnl') },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => onSortChange(item.key as LeaderboardSort)}
                  className={`
                    rounded-full px-3 py-1 text-[11px] transition-all
                    ${leaderboardSort === item.key
                      ? 'bg-[#f0b429] font-bold text-black'
                      : 'border border-[#3a434f] text-[#8b949e] hover:text-white'
                    }
                  `}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {loadingBoard ? (
              <div className="text-xs text-[#8b949e]">{tr(lang, 'loading')}</div>
            ) : leaderboard.length === 0 ? (
              <div className="text-xs text-[#8b949e]">{tr(lang, 'noLeaderboard')}</div>
            ) : (
              <div className="overflow-auto rounded-xl border border-[#2f3642]">
                <table className="min-w-[700px] w-full text-xs font-mono">
                  <thead className="bg-[#0f141c]">
                    <tr className="border-b border-[#30363d] text-[#8b949e]">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">{tr(lang, 'rankUser')}</th>
                      <th className="px-3 py-2 text-right">{tr(lang, 'statWinRate')}</th>
                      <th className="px-3 py-2 text-right">{tr(lang, 'statSharpe')}</th>
                      <th className="px-3 py-2 text-right">{tr(lang, 'statPnl')}</th>
                      <th className="px-3 py-2 text-right">{tr(lang, 'rankTotalTrades')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map(row => (
                      <tr key={`${row.rank}-${row.username}`} className="border-b border-[#21262d] transition-colors hover:bg-[#0d1117]">
                        <td className="px-3 py-2 text-white">{row.rank}</td>
                        <td className="px-3 py-2 text-white">{row.username}</td>
                        <td className="px-3 py-2 text-right text-[#26a69a]">{row.win_rate.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right text-white">{row.sharpe.toFixed(4)}</td>
                        <td className={`px-3 py-2 text-right ${row.total_pnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                          {row.total_pnl >= 0 ? '+' : ''}{row.total_pnl.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right text-white">{row.total_trades}</td>
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
  )
}

export default function Home() {
  const [lang, setLang] = useState<Lang>('zh')
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
  const [orderFlash, setOrderFlash] = useState<OrderFlash | null>(null)
  const [orderFlashVisible, setOrderFlashVisible] = useState(false)

  const chartRef = useRef<ChartRef>(null)
  const orderFlashHideTimerRef = useRef<number | null>(null)
  const orderFlashClearTimerRef = useRef<number | null>(null)

  const clearOrderFlashTimers = useCallback(() => {
    if (orderFlashHideTimerRef.current !== null) {
      window.clearTimeout(orderFlashHideTimerRef.current)
      orderFlashHideTimerRef.current = null
    }
    if (orderFlashClearTimerRef.current !== null) {
      window.clearTimeout(orderFlashClearTimerRef.current)
      orderFlashClearTimerRef.current = null
    }
  }, [])

  const showOrderFlash = useCallback((trade: TradeRecord) => {
    clearOrderFlashTimers()
    setOrderFlash(buildOrderFlash(trade, lang))
    setOrderFlashVisible(false)

    window.requestAnimationFrame(() => {
      setOrderFlashVisible(true)
    })

    orderFlashHideTimerRef.current = window.setTimeout(() => {
      setOrderFlashVisible(false)
    }, 1150)

    orderFlashClearTimerRef.current = window.setTimeout(() => {
      setOrderFlash(null)
    }, 1500)
  }, [clearOrderFlashTimers, lang])

  const handleLangChange = useCallback((next: Lang) => {
    setLang(next)
    api.setApiLanguage(next)
    window.localStorage.setItem(LANG_KEY, next)
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN'
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem(LANG_KEY)
    const normalized = saved
      ? normalizeLang(saved)
      : normalizeLang(window.navigator.language)
    setLang(normalized)
    api.setApiLanguage(normalized)
    document.documentElement.lang = normalized === 'en' ? 'en' : 'zh-CN'
  }, [])

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

  useEffect(() => {
    return () => {
      clearOrderFlashTimers()
    }
  }, [clearOrderFlashTimers])

  const handleAuthed = useCallback((nextAuth: AuthState) => {
    api.setAuthToken(nextAuth.token)
    window.localStorage.setItem(AUTH_TOKEN_KEY, nextAuth.token)
    setAuth(nextAuth)
    setSession(null)
    setCurrentPrice(null)
    setError('')
  }, [])

  const handleLogout = useCallback(() => {
    clearOrderFlashTimers()
    window.localStorage.removeItem(AUTH_TOKEN_KEY)
    api.setAuthToken(null)
    setAuth(null)
    setSession(null)
    setCurrentPrice(null)
    setOrderLevels(null)
    setStats(null)
    setLeaderboard([])
    setError('')
    setOrderFlash(null)
    setOrderFlashVisible(false)
  }, [clearOrderFlashTimers])

  const handleStart = useCallback(async (initialBalance: number) => {
    setLoading(true)
    setError('')
    setOrderLevels(null)
    setOrderFlash(null)
    setOrderFlashVisible(false)
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
      showOrderFlash(res.trade)

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
  }, [session, timeframe, refreshDashboard, showOrderFlash])

  const handleRestart = useCallback(() => {
    clearOrderFlashTimers()
    setSession(null)
    setCurrentPrice(null)
    setTimeframe('1H')
    setError('')
    setOrderLevels(null)
    setOrderFlash(null)
    setOrderFlashVisible(false)
    refreshDashboard()
  }, [clearOrderFlashTimers, refreshDashboard])

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d1117] text-sm text-[#8b949e]">
        {tr(lang, 'checkingLogin')}
      </div>
    )
  }

  if (!auth) {
    return <AuthScreen lang={lang} onLangChange={handleLangChange} onAuthed={handleAuthed} />
  }

  if (!session) {
    return (
      <LobbyScreen
        lang={lang}
        onLangChange={handleLangChange}
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
    <div className="relative flex min-h-[100dvh] flex-col overflow-y-auto bg-[#0d1117] md:h-screen md:overflow-hidden">
      <div className="shrink-0 bg-[#0d1117] px-3 pt-2 md:px-4">
        <div className="flex justify-end">
          <LangSwitch lang={lang} onChange={handleLangChange} />
        </div>
      </div>
      <Header lang={lang} session={session} currentPrice={currentPrice} />

      {orderFlash && (
        <div
          className={`
            pointer-events-none fixed left-1/2 top-[78px] z-50 w-[min(92vw,360px)] -translate-x-1/2
            transition-all duration-300 md:top-[90px]
            ${orderFlashVisible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}
          `}
        >
          <div
            className={`
              rounded-2xl border px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur
              ${orderFlash.tone === 'win'
                ? 'border-[#26a69a]/65 bg-[#26a69a]/16'
                : orderFlash.tone === 'loss'
                  ? 'border-[#ef5350]/65 bg-[#ef5350]/16'
                  : 'border-[#f0b429]/65 bg-[#f0b429]/14'
              }
            `}
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl leading-none">{orderFlash.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">{orderFlash.title}</div>
                <div className={`text-lg font-black leading-6 ${orderFlash.tone === 'loss' ? 'text-[#ff8a80]' : orderFlash.tone === 'win' ? 'text-[#59d9c9]' : 'text-[#f6d26f]'}`}>
                  {orderFlash.pnlText}
                </div>
                <div className="text-[11px] text-[#c9d1d9]">{orderFlash.reasonText}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="border-b border-[#ef5350]/30 bg-[#ef5350]/10 px-4 py-1.5 text-xs text-[#ef5350]">
          ⚠ {error}
          <button className="ml-3 underline" onClick={() => setError('')}>{tr(lang, 'close')}</button>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex h-[46dvh] min-h-[300px] flex-col overflow-hidden lg:h-auto lg:flex-1">
          <Chart
            lang={lang}
            ref={chartRef}
            timeframe={timeframe}
            orderLevels={orderLevels}
            onTimeframeChange={handleTimeframeChange}
          />
        </div>

        <div className="w-full shrink-0 border-t border-[#21262d] lg:w-72 lg:border-l lg:border-t-0 lg:overflow-y-auto">
          <TradePanel
            lang={lang}
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
        lang={lang}
        disabled={session.game_over}
        loading={loading}
        onStep={handleStep}
      />

      <div className="h-56 shrink-0 lg:h-40">
        <TradeHistory lang={lang} trades={session.trade_history} />
      </div>

      {session.game_over && (
        <GameOver
          lang={lang}
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
