'use client'

/**
 * 主页面 —— XAUUSD 盘感训练系统
 * ─────────────────────────────────────────────────────────
 * 布局：
 *   ┌─────────────────────────────────────────────────────┐
 *   │  Header (顶栏：余额/时间/价格)                       │
 *   ├────────────────────────────────────┬────────────────┤
 *   │                                    │                │
 *   │   Chart (K线图，flex-1)            │  TradePanel    │
 *   │                                    │  (右侧下单)    │
 *   ├────────────────────────────────────┴────────────────┤
 *   │  StepControls (推演按钮)                            │
 *   ├─────────────────────────────────────────────────────┤
 *   │  TradeHistory (底部交易记录表)                      │
 *   └─────────────────────────────────────────────────────┘
 *
 * 状态管理策略：
 *   - 游戏状态集中在本页 useState 管理
 *   - 图表数据通过 ref.setData/updateBars 直接操作 DOM（不走 React 渲染）
 *   - 步进后只发送增量 new_bars 给图表，不重载全量数据（性能优先）
 *   - 切换周期：重新调用 getKlines API → setData 全量刷新
 */

import { useState, useRef, useCallback } from 'react'
// Chart 内部已用 mounted 守卫屏蔽 SSR，可直接 import（dynamic 会破坏 forwardRef）
import Chart        from '@/components/Chart'
import type { ChartRef } from '@/components/Chart'
import Header       from '@/components/Header'
import StepControls from '@/components/StepControls'
import TradePanel   from '@/components/TradePanel'
import TradeHistory from '@/components/TradeHistory'
import GameOver     from '@/components/GameOver'
import * as api     from '@/lib/api'
import type { GameSession, PriceTick, Timeframe } from '@/lib/types'

// ─────────────────────────────────────────────────────────
// 开始画面：输入初始本金
// ─────────────────────────────────────────────────────────
function StartScreen({ onStart }: { onStart: (balance: number) => void }) {
  const [balance, setBalance] = useState('10000')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleStart() {
    const val = parseFloat(balance)
    if (isNaN(val) || val < 1000) { setError('最小初始本金 $1,000'); return }
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
    <div className="flex items-center justify-center h-screen bg-[#0d1117]">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 w-96 space-y-5">
        <div className="text-center">
          <div className="text-[#f0b429] text-3xl font-bold tracking-widest mb-1">XAUUSD</div>
          <div className="text-[#8b949e] text-sm">黄金期货盘感训练系统</div>
        </div>

        <div>
          <label className="text-[#8b949e] text-xs block mb-1.5">初始本金（USD）</label>
          <input
            type="number"
            min="1000"
            step="1000"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2.5
                       text-white font-mono text-lg focus:outline-none focus:border-[#f0b429]"
          />
        </div>

        <div className="text-xs text-[#8b949e] space-y-0.5">
          <div>• 随机抽取历史某时间段开始训练</div>
          <div>• 每局限 10 次开仓机会</div>
          <div>• 下单后自动快进至 SL/TP 触发</div>
          <div>• 合约规格：1手=100盎司，固定点差$0.20</div>
        </div>

        {error && (
          <div className="text-[#ef5350] text-xs bg-[#ef5350]/10 rounded px-3 py-2">{error}</div>
        )}

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-[#f0b429] text-black font-bold text-sm
                     hover:bg-[#f0b429]/90 transition-colors cursor-pointer
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '正在初始化…' : '开始训练'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// 主游戏界面
// ─────────────────────────────────────────────────────────
export default function Home() {
  // ── 游戏状态 ───────────────────────────────────────────
  const [session,      setSession]      = useState<GameSession | null>(null)
  const [currentPrice, setCurrentPrice] = useState<PriceTick | null>(null)
  const [timeframe,    setTimeframe]    = useState<Timeframe>('1H')
  const [loading,      setLoading]      = useState(false)   // 任意 API 请求中
  const [error,        setError]        = useState('')

  // 图表 ref（直接操作图表，绕过 React 重渲）
  const chartRef = useRef<ChartRef>(null)

  // ── 开始新游戏 ─────────────────────────────────────────
  const handleStart = useCallback(async (initialBalance: number) => {
    setLoading(true)
    setError('')
    try {
      const data = await api.startGame(initialBalance)
      // 构造完整 session 对象（初始时 trade_history 为空）
      const sess: GameSession = {
        session_id:      data.session_id,
        initial_balance: data.initial_balance,
        balance:         data.initial_balance,
        current_time:    data.current_time,
        trades_used:     0,
        max_trades:      data.max_trades,
        trade_history:   [],
        game_over:       false,
        game_over_reason: '',
        current_price:   data.current_price,
      }
      setSession(sess)
      setCurrentPrice(data.current_price)

      // 立即加载初始 K 线（1H）
      const klinesRes = await api.getKlines(data.session_id, '1H', 300)
      chartRef.current?.setData(klinesRes.klines)
    } catch (e) {
      setError(String(e))
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  // ── 切换周期 ───────────────────────────────────────────
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

  // ── 时间步进 ───────────────────────────────────────────
  const handleStep = useCallback(async (minutes: 1 | 5 | 15 | 60) => {
    if (!session) return
    setLoading(true)
    setError('')
    try {
      const res = await api.stepGame(session.session_id, minutes)

      // 更新 session 时间游标
      setSession(prev => prev ? { ...prev, current_time: res.current_time } : null)
      setCurrentPrice(res.current_price)

      // 将增量 1M K 线推送给图表
      // 注意：如果当前周期不是1M，需要重采样后的K线
      // 简单处理：步进时始终以1M级别更新图表；若周期>1M则图表会自动聚合
      // 更优雅的做法是步进后重新拉取当前周期的最近几根K线
      if (timeframe === '1M') {
        // 1M 周期直接追加新K线
        chartRef.current?.updateBars(res.new_bars)
      } else {
        // 其他周期：步进后重新拉取最新K线（增量合并较复杂，全量拉取最简单可靠）
        const klinesRes = await api.getKlines(session.session_id, timeframe, 300)
        chartRef.current?.setData(klinesRes.klines)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [session, timeframe])

  // ── 下单 ───────────────────────────────────────────────
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
        lot_size:   lotSize,
        sl,
        tp,
      })

      // 更新 session 状态（余额、时间游标、交易记录、游戏结束标志）
      setSession(prev => {
        if (!prev) return null
        return {
          ...prev,
          balance:          res.balance,
          trades_used:      res.trades_used,
          current_time:     res.current_time,
          trade_history:    [...prev.trade_history, res.trade],
          game_over:        res.game_over,
          game_over_reason: res.game_over_reason,
        }
      })

      // 快进结算后时间游标大幅跳跃，需要重新拉取K线
      const klinesRes = await api.getKlines(session.session_id, timeframe, 300)
      chartRef.current?.setData(klinesRes.klines)
      setCurrentPrice(klinesRes.current_price)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [session, timeframe])

  // ── 重新开始 ───────────────────────────────────────────
  const handleRestart = useCallback(() => {
    setSession(null)
    setCurrentPrice(null)
    setTimeframe('1H')
    setError('')
  }, [])

  // ── 渲染：开始画面 ─────────────────────────────────────
  if (!session) {
    return <StartScreen onStart={handleStart} />
  }

  // ── 渲染：主游戏界面 ───────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0d1117]">
      {/* 顶栏 */}
      <Header session={session} currentPrice={currentPrice} />

      {/* 错误提示条 */}
      {error && (
        <div className="bg-[#ef5350]/10 border-b border-[#ef5350]/30 px-4 py-1.5 text-[#ef5350] text-xs">
          ⚠ {error}
          <button className="ml-3 underline" onClick={() => setError('')}>关闭</button>
        </div>
      )}

      {/* 主内容区（图表 + 交易面板） */}
      <div className="flex flex-1 overflow-hidden">
        {/* K 线图区域 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Chart
            ref={chartRef}
            timeframe={timeframe}
            onTimeframeChange={handleTimeframeChange}
          />
        </div>

        {/* 右侧交易面板（固定宽度） */}
        <div className="w-56 shrink-0 overflow-y-auto">
          <TradePanel
            sessionId={session.session_id}
            currentPrice={currentPrice}
            disabled={session.game_over || session.trades_used >= session.max_trades}
            loading={loading}
            onOrder={handleOrder}
          />
        </div>
      </div>

      {/* 推演控制台 */}
      <StepControls
        disabled={session.game_over}
        loading={loading}
        onStep={handleStep}
      />

      {/* 底部交易记录 */}
      <div className="h-40 shrink-0">
        <TradeHistory trades={session.trade_history} />
      </div>

      {/* 游戏结束弹窗 */}
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
