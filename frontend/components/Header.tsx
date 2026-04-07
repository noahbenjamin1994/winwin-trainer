'use client'

import type { GameSession, PriceTick } from '@/lib/types'
import { type Lang, numberLocale, tr } from '@/lib/i18n'

interface Props {
  lang: Lang
  session: GameSession | null
  currentPrice: PriceTick | null
  onExit?: () => void
  langSwitch?: React.ReactNode
}

/** Format in-game timestamp (hide year to reduce date-based guessing). */
function formatGameTime(iso: string): string {
  try {
    const d = new Date(iso)
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

export default function Header({ lang, session, currentPrice, onExit, langSwitch }: Props) {
  const totalPnl = session ? session.balance - session.initial_balance : 0
  const pnlPct   = session ? (totalPnl / session.initial_balance) * 100 : 0

  return (
    <header className="shrink-0 border-b border-[#1a1714] bg-[#080b10] px-3 py-2 md:px-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-widest text-[#f0b429]">XAUUSD</span>
          <span className="text-xs text-[#554d3d]">{tr(lang, 'training')}</span>
        </div>

        <div className="flex items-center gap-3">
          {currentPrice ? (
            <div className="flex items-center gap-3 text-[11px] font-mono md:text-xs">
              <div>
                <span className="text-[#554d3d]">Bid </span>
                <span className="font-bold text-[#ef5350]">{currentPrice.bid.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[#554d3d]">Ask </span>
                <span className="font-bold text-[#26a69a]">{currentPrice.ask.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="w-24" />
          )}
          {onExit && (
            <button
              onClick={onExit}
              className="ml-2 rounded border border-[#30363d] px-2.5 py-1 text-[11px] text-[#554d3d] transition-colors hover:border-[#ef5350] hover:text-[#ef5350]"
            >
              {tr(lang, 'exitSession')}
            </button>
          )}
          {langSwitch}
        </div>
      </div>

      {session ? (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] md:flex md:items-center md:gap-6 md:text-xs">
          <div className="flex items-center gap-1">
            <span className="text-[#554d3d]">{tr(lang, 'round')}</span>
            <span className="font-mono font-bold text-white">
              {session.trades_used}
              <span className="text-[#554d3d]">/{session.max_trades}</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#554d3d]">{tr(lang, 'balance')}</span>
            <span className="font-mono font-bold text-white">
              ${session.balance.toLocaleString(numberLocale(lang), { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#554d3d]">{tr(lang, 'totalPnl')}</span>
            <span className={`font-mono font-bold ${pnlClass(totalPnl)}`}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
              <span className="ml-1 text-[10px]">
                ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#554d3d]">{tr(lang, 'gameTime')}</span>
            <span className="font-mono font-bold text-[#f0b429]">
              {formatGameTime(session.current_time)}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-xs text-[#554d3d]">{tr(lang, 'gameNotStarted')}</div>
      )}
    </header>
  )
}
