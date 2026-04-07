'use client'

import type { TradeRecord } from '@/lib/types'
import { type Lang, tr } from '@/lib/i18n'

interface Props {
  lang: Lang
  trades: TradeRecord[]
}

function fmt(iso: string) {
  try {
    const d = new Date(iso)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const HH = String(d.getHours()).padStart(2, '0')
    const MM = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${HH}:${MM}`
  } catch { return iso }
}

export default function TradeHistory({ lang, trades }: Props) {
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  const reasonLabel: Record<string, string> = {
    tp: tr(lang, 'reasonTp'),
    sl: tr(lang, 'reasonSl'),
    stop_out: tr(lang, 'reasonStopOut'),
    data_end: tr(lang, 'reasonDataEnd'),
  }

  return (
    <div className="h-full flex flex-col bg-[#080b10] border-t border-[#1a1714]">
      
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-[#1a1714] bg-[#0b0e14] shrink-0">
        <span className="text-[#554d3d] text-xs font-bold uppercase tracking-wider">
          {tr(lang, 'tradeRecord', { count: trades.length })}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#554d3d] sm:hidden">{tr(lang, 'swipeHint')}</span>
          {trades.length > 0 && (
            <span className={`text-xs font-mono font-bold ${totalPnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
              {tr(lang, 'total')}: {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      
      <div className="flex-1 overflow-auto">
        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#554d3d] text-xs">
            {tr(lang, 'noTrades')}
          </div>
        ) : (
          <table className="min-w-[980px] w-full text-xs font-mono">
            <thead className="sticky top-0 bg-[#0b0e14]">
              <tr className="text-[#554d3d] border-b border-[#1a1714]">
                <th className="px-3 py-1.5 text-left">#</th>
                <th className="px-3 py-1.5 text-left">{tr(lang, 'direction')}</th>
                <th className="px-3 py-1.5 text-right">{tr(lang, 'lotSize')}</th>
                <th className="px-3 py-1.5 text-right">{tr(lang, 'entryPrice')}</th>
                <th className="px-3 py-1.5 text-right">{tr(lang, 'closePrice')}</th>
                <th className="px-3 py-1.5 text-right">{tr(lang, 'sl')}</th>
                <th className="px-3 py-1.5 text-right">{tr(lang, 'tp')}</th>
                <th className="px-3 py-1.5 text-left">{tr(lang, 'entryTime')}</th>
                <th className="px-3 py-1.5 text-left">{tr(lang, 'closeTime')}</th>
                <th className="px-3 py-1.5 text-center">{tr(lang, 'reason')}</th>
                <th className="px-3 py-1.5 text-right">{tr(lang, 'pnlUsd')}</th>
              </tr>
            </thead>
            <tbody>
              {[...trades].reverse().map(t => (
                <tr
                  key={t.id}
                  className="border-b border-[#1a1714] hover:bg-[#0b0e14] transition-colors"
                >
                  <td className="px-3 py-1.5 text-[#554d3d]">{t.id}</td>
                  <td className="px-3 py-1.5">
                    <span className={`font-bold ${t.direction === 'Buy' ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                      {t.direction === 'Buy' ? tr(lang, 'long') : tr(lang, 'short')}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-white">{t.lot_size.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-white">{t.entry_price.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-white">{t.close_price.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-[#ef5350]">{t.sl.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-[#26a69a]">{t.tp.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-[#554d3d]">{fmt(t.entry_time)}</td>
                  <td className="px-3 py-1.5 text-[#554d3d]">{fmt(t.close_time)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`
                      px-1.5 py-0.5 rounded text-[10px] font-bold
                      ${t.close_reason === 'tp'          ? 'bg-[#26a69a]/20 text-[#26a69a]' : ''}
                      ${t.close_reason === 'sl'          ? 'bg-[#ef5350]/20 text-[#ef5350]' : ''}
                      ${t.close_reason === 'stop_out'    ? 'bg-red-900/40 text-red-400'      : ''}
                      ${t.close_reason === 'data_end'    ? 'bg-gray-700/40 text-gray-400'    : ''}
                    `}>
                      {reasonLabel[t.close_reason] ?? t.close_reason}
                    </span>
                  </td>
                  <td className={`px-3 py-1.5 text-right font-bold
                    ${t.pnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                    {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
