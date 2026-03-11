'use client'

import type { GameSession, PriceTick } from '@/lib/types'

interface Props {
  session: GameSession | null
  currentPrice: PriceTick | null
}

/** 格式化游戏内时间（隐藏年份，只露出日期+时间，防止玩家根据年份猜测市场走势） */
function formatGameTime(iso: string): string {
  try {
    const d = new Date(iso)
    // 只展示 月-日 HH:MM（隐藏年份）
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const HH = String(d.getHours()).padStart(2, '0')
    const MM = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${HH}:${MM}`
  } catch {
    return iso
  }
}

function pnlClass(val: number) {
  if (val > 0) return 'text-[#26a69a]'
  if (val < 0) return 'text-[#ef5350]'
  return 'text-gray-400'
}

export default function Header({ session, currentPrice }: Props) {
  const totalPnl = session ? session.balance - session.initial_balance : 0
  const pnlPct   = session ? (totalPnl / session.initial_balance) * 100 : 0

  return (
    <header className="shrink-0 border-b border-[#21262d] bg-[#0d1117] px-3 py-2 md:px-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-widest text-[#f0b429]">XAUUSD</span>
          <span className="text-xs text-[#8b949e]">盘感训练</span>
        </div>

        {currentPrice ? (
          <div className="flex items-center gap-3 text-[11px] font-mono md:text-xs">
            <div>
              <span className="text-[#8b949e]">Bid </span>
              <span className="font-bold text-[#ef5350]">{currentPrice.bid.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[#8b949e]">Ask </span>
              <span className="font-bold text-[#26a69a]">{currentPrice.ask.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div className="w-24" />
        )}
      </div>

      {session ? (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] md:flex md:items-center md:gap-6 md:text-xs">
          <div className="flex items-center gap-1">
            <span className="text-[#8b949e]">轮次</span>
            <span className="font-mono font-bold text-white">
              {session.trades_used}
              <span className="text-[#8b949e]">/{session.max_trades}</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#8b949e]">余额</span>
            <span className="font-mono font-bold text-white">
              ${session.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#8b949e]">总盈亏</span>
            <span className={`font-mono font-bold ${pnlClass(totalPnl)}`}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
              <span className="ml-1 text-[10px]">
                ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#8b949e]">游戏时间</span>
            <span className="font-mono font-bold text-[#f0b429]">
              {formatGameTime(session.current_time)}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-xs text-[#8b949e]">— 尚未开始游戏 —</div>
      )}
    </header>
  )
}
