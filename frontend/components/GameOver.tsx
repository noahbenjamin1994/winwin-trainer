'use client'

import { useEffect } from 'react'
import type { TradeRecord } from '@/lib/types'
import { type Lang, numberLocale, tr } from '@/lib/i18n'

interface Props {
  lang: Lang
  reason: string
  initialBalance: number
  finalBalance: number
  trades: TradeRecord[]
  onRestart: () => void
}

export default function GameOver({ lang, reason, initialBalance, finalBalance, trades, onRestart }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onRestart()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onRestart])

  const totalPnl = finalBalance - initialBalance
  const pnlPct   = (totalPnl / initialBalance) * 100
  const winCount = trades.filter(t => t.pnl > 0).length
  const lossCount = trades.filter(t => t.pnl < 0).length
  const winRate  = trades.length > 0 ? (winCount / trades.length * 100).toFixed(0) : '0'
  const bestTrade  = trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0
  const reasonText: Record<string, string> = {
    max_trades: tr(lang, 'gameOverMaxTrades'),
    stop_out: tr(lang, 'gameOverStopOut'),
    data_end: tr(lang, 'gameOverDataEnd'),
  }

  const isWin = totalPnl > 0
  const isStopOut = reason === 'stop_out'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className={`
        w-full max-w-md rounded-2xl border bg-[#0d1117] p-8 space-y-6
        ${isStopOut ? 'border-[#ef5350]/40 shadow-[0_0_60px_rgba(239,83,80,0.08)]'
          : isWin ? 'border-[#f0b429]/30 shadow-[0_0_60px_rgba(240,180,41,0.08)]'
          : 'border-[#21262d]'
        }
      `}>
        <div className="text-center">
          <div className="text-sm uppercase tracking-widest text-[#555d68] mb-3">
            {isStopOut ? tr(lang, 'gameOverStopOutTitle') : tr(lang, 'gameOverFinishedTitle')}
          </div>
          <div className={`font-mono text-5xl font-bold tracking-tight ${isWin ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
          </div>
          <div className={`mt-1 font-mono text-sm ${isWin ? 'text-[#26a69a]/60' : 'text-[#ef5350]/60'}`}>
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}% · ${finalBalance.toLocaleString(numberLocale(lang), { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-[11px] text-[#444c56]">{reasonText[reason] ?? reason}</div>
        </div>

        <div className="grid grid-cols-3 gap-x-4 gap-y-3 border-t border-[#1b2028] pt-5 text-center">
          {[
            { label: tr(lang, 'tradeCount'), value: `${trades.length}` },
            { label: tr(lang, 'statWinRate'), value: `${winRate}%` },
            { label: tr(lang, 'winTrades'), value: `${winCount}`, color: 'text-[#26a69a]' },
            { label: tr(lang, 'lossTrades'), value: `${lossCount}`, color: 'text-[#ef5350]' },
            { label: tr(lang, 'bestTrade'), value: `+$${bestTrade.toFixed(2)}`, color: 'text-[#26a69a]' },
            { label: tr(lang, 'worstTrade'), value: `$${worstTrade.toFixed(2)}`, color: 'text-[#ef5350]' },
          ].map(item => (
            <div key={item.label}>
              <div className={`font-mono text-lg font-bold ${item.color ?? 'text-white'}`}>{item.value}</div>
              <div className="text-[9px] uppercase tracking-widest text-[#444c56] mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onRestart}
          className="w-full rounded-lg bg-[#f0b429] py-3.5 text-sm font-bold text-black transition-all hover:bg-[#daa520] cursor-pointer"
        >
          {tr(lang, 'playAgain')}
        </button>
      </div>
    </div>
  )
}
