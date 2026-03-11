'use client'

/**
 * 交易面板（右侧边栏）
 * 包含：买入/卖出方向选择、手数、止损/止盈输入、快捷计算、确认下单
 *
 * 价格体系说明：
 *   - 所有价格以 Bid 坐标输入（与图表K线一致）
 *   - 多单：SL < 当前Bid < TP
 *   - 空单：TP < 当前Bid < SL
 *   - 实际成交价：多单用Ask(Bid+0.20)，空单用Bid（由后端处理）
 */

import { useState, useEffect } from 'react'
import type { PriceTick } from '@/lib/types'

interface Props {
  sessionId: string
  currentPrice: PriceTick | null
  disabled: boolean
  loading: boolean
  onOrder: (direction: 'Buy' | 'Sell', lotSize: number, sl: number, tp: number) => void
}

const SPREAD = 0.20

export default function TradePanel({
  sessionId,
  currentPrice,
  disabled,
  loading,
  onOrder,
}: Props) {
  const [direction, setDirection] = useState<'Buy' | 'Sell'>('Buy')
  const [lotSize,   setLotSize]   = useState('0.10')
  const [sl,        setSl]        = useState('')
  const [tp,        setTp]        = useState('')
  const [slPts,     setSlPts]     = useState('30')  // 止损点数（快捷）
  const [tpPts,     setTpPts]     = useState('60')  // 止盈点数（快捷）
  const [error,     setError]     = useState('')

  const bid = currentPrice?.bid ?? 0
  const ask = currentPrice?.ask ?? (bid + SPREAD)

  // 根据点数快捷计算 SL/TP
  useEffect(() => {
    if (!bid) return
    const slP = parseFloat(slPts) || 30
    const tpP = parseFloat(tpPts) || 60
    if (direction === 'Buy') {
      setSl((bid - slP * 0.01).toFixed(2))  // 1点 = $0.01
      setTp((bid + tpP * 0.01).toFixed(2))
    } else {
      setSl((bid + slP * 0.01).toFixed(2))
      setTp((bid - tpP * 0.01).toFixed(2))
    }
  }, [direction, bid, slPts, tpPts])

  function handleSubmit() {
    setError('')
    const lot = parseFloat(lotSize)
    const slV = parseFloat(sl)
    const tpV = parseFloat(tp)

    if (isNaN(lot) || lot < 0.01) { setError('手数最小 0.01'); return }
    if (isNaN(slV) || isNaN(tpV)) { setError('止损/止盈价格无效'); return }

    // 前端预校验（后端也会校验，这里给用户即时反馈）
    if (direction === 'Buy') {
      const entry = ask
      if (slV >= entry) { setError(`多单止损必须低于 Ask(${entry.toFixed(2)})`); return }
      if (tpV <= entry) { setError(`多单止盈必须高于 Ask(${entry.toFixed(2)})`); return }
    } else {
      const entry = bid
      if (slV <= entry) { setError(`空单止损必须高于 Bid(${entry.toFixed(2)})`); return }
      if (tpV >= entry) { setError(`空单止盈必须低于 Bid(${entry.toFixed(2)})`); return }
    }

    onOrder(direction, lot, slV, tpV)
  }

  // 预估盈亏（简单计算，不含后端真实结算）
  const lot   = parseFloat(lotSize) || 0
  const slVal = parseFloat(sl) || 0
  const tpVal = parseFloat(tp) || 0
  const riskUsd   = direction === 'Buy'
    ? Math.abs((slVal - ask) * lot * 100)
    : Math.abs((bid - slVal) * lot * 100)
  const rewardUsd = direction === 'Buy'
    ? Math.abs((tpVal - ask) * lot * 100)
    : Math.abs((bid - tpVal) * lot * 100)
  const rr = riskUsd > 0 ? (rewardUsd / riskUsd).toFixed(2) : '—'

  return (
    <div className="flex flex-col h-full bg-[#161b22] border-l border-[#21262d] text-xs">
      {/* 标题 */}
      <div className="px-4 py-2 border-b border-[#21262d] text-[#8b949e] font-bold uppercase tracking-wider">
        下单
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 买入 / 卖出 方向 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDirection('Buy')}
            disabled={disabled}
            className={`
              py-3 rounded font-bold text-sm transition-all
              ${direction === 'Buy'
                ? 'bg-[#26a69a] text-white'
                : 'bg-[#0d1117] text-[#26a69a] border border-[#26a69a] hover:bg-[#26a69a]/10'
              }
              ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            ▲ 买入<br />
            <span className="text-[10px] font-normal">{ask.toFixed(2)}</span>
          </button>
          <button
            onClick={() => setDirection('Sell')}
            disabled={disabled}
            className={`
              py-3 rounded font-bold text-sm transition-all
              ${direction === 'Sell'
                ? 'bg-[#ef5350] text-white'
                : 'bg-[#0d1117] text-[#ef5350] border border-[#ef5350] hover:bg-[#ef5350]/10'
              }
              ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            ▼ 卖出<br />
            <span className="text-[10px] font-normal">{bid.toFixed(2)}</span>
          </button>
        </div>

        {/* 手数 */}
        <div>
          <label className="text-[#8b949e] block mb-1">手数（Lot）</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={lotSize}
            onChange={e => setLotSize(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-white font-mono
                       focus:outline-none focus:border-[#f0b429]"
          />
          <div className="text-[#8b949e] mt-0.5">≈ {(lot * 100).toFixed(0)} 盎司</div>
        </div>

        {/* 快捷点数设置 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[#8b949e] block mb-1">止损（点数）</label>
            <input
              type="number"
              min="1"
              value={slPts}
              onChange={e => setSlPts(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#ef5350] font-mono
                         focus:outline-none focus:border-[#ef5350]"
            />
          </div>
          <div>
            <label className="text-[#8b949e] block mb-1">止盈（点数）</label>
            <input
              type="number"
              min="1"
              value={tpPts}
              onChange={e => setTpPts(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#26a69a] font-mono
                         focus:outline-none focus:border-[#26a69a]"
            />
          </div>
        </div>

        {/* 精确价格 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[#8b949e] block mb-1">止损价</label>
            <input
              type="number"
              step="0.01"
              value={sl}
              onChange={e => setSl(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#ef5350] font-mono
                         focus:outline-none focus:border-[#ef5350]"
            />
          </div>
          <div>
            <label className="text-[#8b949e] block mb-1">止盈价</label>
            <input
              type="number"
              step="0.01"
              value={tp}
              onChange={e => setTp(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-[#26a69a] font-mono
                         focus:outline-none focus:border-[#26a69a]"
            />
          </div>
        </div>

        {/* 风险/回报 预估 */}
        <div className="bg-[#0d1117] rounded p-2 space-y-1">
          <div className="flex justify-between">
            <span className="text-[#8b949e]">风险</span>
            <span className="text-[#ef5350] font-mono">-${riskUsd.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8b949e]">回报</span>
            <span className="text-[#26a69a] font-mono">+${rewardUsd.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-[#21262d] pt-1">
            <span className="text-[#8b949e]">盈亏比</span>
            <span className="text-white font-mono font-bold">1 : {rr}</span>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-[#ef5350]/10 border border-[#ef5350]/30 rounded px-2 py-1.5 text-[#ef5350]">
            {error}
          </div>
        )}

        {/* 确认下单 */}
        <button
          onClick={handleSubmit}
          disabled={disabled || loading || !currentPrice}
          className={`
            w-full py-3 rounded font-bold text-sm transition-all
            ${direction === 'Buy' ? 'bg-[#26a69a]' : 'bg-[#ef5350]'}
            text-white
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:opacity-90 cursor-pointer
          `}
        >
          {loading
            ? '结算中…'
            : `确认 ${direction === 'Buy' ? '买入' : '卖出'} @ ${direction === 'Buy' ? ask.toFixed(2) : bid.toFixed(2)}`
          }
        </button>
      </div>

      {/* 底部：sessionId 调试信息 */}
      <div className="px-3 py-1.5 border-t border-[#21262d] text-[#30363d] text-[10px] truncate">
        {sessionId ? `SID: ${sessionId.slice(0, 8)}…` : '—'}
      </div>
    </div>
  )
}
