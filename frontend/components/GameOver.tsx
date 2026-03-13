'use client'

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

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md p-6 space-y-4">
        
        <div className="text-center">
          <div className="text-2xl font-bold mb-1">
            {reason === 'stop_out' ? tr(lang, 'gameOverStopOutTitle') : tr(lang, 'gameOverFinishedTitle')}
          </div>
          <div className="text-[#8b949e] text-sm">{reasonText[reason] ?? reason}</div>
        </div>

        
        <div className="bg-[#0d1117] rounded-lg p-4 text-center">
          <div className="text-[#8b949e] text-xs mb-1">{tr(lang, 'finalEquity')}</div>
          <div className={`text-3xl font-bold font-mono ${totalPnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            ${finalBalance.toLocaleString(numberLocale(lang), { minimumFractionDigits: 2 })}
          </div>
          <div className={`text-sm font-mono mt-1 ${totalPnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
          </div>
        </div>

        
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: tr(lang, 'tradeCount'), value: `${trades.length} ${tr(lang, 'timesUnit')}`.trim() },
            { label: tr(lang, 'statWinRate'), value: `${winRate}%` },
            { label: tr(lang, 'winTrades'), value: `${winCount} ${tr(lang, 'tradesUnit')}`.trim(), color: 'text-[#26a69a]' },
            { label: tr(lang, 'lossTrades'), value: `${lossCount} ${tr(lang, 'tradesUnit')}`.trim(), color: 'text-[#ef5350]' },
            { label: tr(lang, 'bestTrade'), value: `+$${bestTrade.toFixed(2)}`, color: 'text-[#26a69a]' },
            { label: tr(lang, 'worstTrade'), value: `$${worstTrade.toFixed(2)}`, color: 'text-[#ef5350]' },
          ].map(item => (
            <div key={item.label} className="bg-[#0d1117] rounded p-2">
              <div className="text-[#8b949e]">{item.label}</div>
              <div className={`font-mono font-bold mt-0.5 ${item.color ?? 'text-white'}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        
        <button
          onClick={onRestart}
          className="w-full py-3 rounded-lg bg-[#f0b429] text-black font-bold text-sm
                     hover:bg-[#f0b429]/90 transition-colors cursor-pointer"
        >
          {tr(lang, 'playAgain')}
        </button>
      </div>
    </div>
  )
}
