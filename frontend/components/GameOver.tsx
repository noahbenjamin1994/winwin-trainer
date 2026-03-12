'use client'

import type { TradeRecord } from '@/lib/types'

interface Props {
  reason: string
  initialBalance: number
  finalBalance: number
  trades: TradeRecord[]
  onRestart: () => void
}

const REASON_TEXT: Record<string, string> = {
  max_trades:   '已完成全部 10 次交易',
  stop_out:     '保证金比例触发 30% 强平',
  data_end:     '已到达历史数据末尾',
}

export default function GameOver({ reason, initialBalance, finalBalance, trades, onRestart }: Props) {
  const totalPnl = finalBalance - initialBalance
  const pnlPct   = (totalPnl / initialBalance) * 100
  const winCount = trades.filter(t => t.pnl > 0).length
  const lossCount = trades.filter(t => t.pnl < 0).length
  const winRate  = trades.length > 0 ? (winCount / trades.length * 100).toFixed(0) : '0'
  const bestTrade  = trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md p-6 space-y-4">
        {/* 标题 */}
        <div className="text-center">
          <div className="text-2xl font-bold mb-1">
            {reason === 'stop_out' ? '💥 强平' : '🏁 训练结束'}
          </div>
          <div className="text-[#8b949e] text-sm">{REASON_TEXT[reason] ?? reason}</div>
        </div>

        {/* 总盈亏 */}
        <div className="bg-[#0d1117] rounded-lg p-4 text-center">
          <div className="text-[#8b949e] text-xs mb-1">最终净值</div>
          <div className={`text-3xl font-bold font-mono ${totalPnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            ${finalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className={`text-sm font-mono mt-1 ${totalPnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
          </div>
        </div>

        {/* 统计指标 */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: '交易次数', value: `${trades.length} 次` },
            { label: '胜率',     value: `${winRate}%` },
            { label: '盈利笔数', value: `${winCount} 笔`, color: 'text-[#26a69a]' },
            { label: '亏损笔数', value: `${lossCount} 笔`, color: 'text-[#ef5350]' },
            { label: '最佳单笔', value: `+$${bestTrade.toFixed(2)}`, color: 'text-[#26a69a]' },
            { label: '最差单笔', value: `$${worstTrade.toFixed(2)}`, color: 'text-[#ef5350]' },
          ].map(item => (
            <div key={item.label} className="bg-[#0d1117] rounded p-2">
              <div className="text-[#8b949e]">{item.label}</div>
              <div className={`font-mono font-bold mt-0.5 ${item.color ?? 'text-white'}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {/* 重新开始 */}
        <button
          onClick={onRestart}
          className="w-full py-3 rounded-lg bg-[#f0b429] text-black font-bold text-sm
                     hover:bg-[#f0b429]/90 transition-colors cursor-pointer"
        >
          再来一局
        </button>
      </div>
    </div>
  )
}
