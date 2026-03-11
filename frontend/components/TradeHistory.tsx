'use client'

import type { TradeRecord } from '@/lib/types'

interface Props {
  trades: TradeRecord[]
}

const REASON_LABEL: Record<string, string> = {
  tp:          '止盈',
  sl:          '止损',
  margin_call: '爆仓',
  data_end:    '数据末尾',
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

export default function TradeHistory({ trades }: Props) {
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)

  return (
    <div className="h-full flex flex-col bg-[#0d1117] border-t border-[#21262d]">
      {/* 标题行 */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-[#21262d] bg-[#161b22] shrink-0">
        <span className="text-[#8b949e] text-xs font-bold uppercase tracking-wider">
          交易记录 ({trades.length})
        </span>
        {trades.length > 0 && (
          <span className={`text-xs font-mono font-bold ${totalPnl >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
            合计: {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
          </span>
        )}
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#8b949e] text-xs">
            尚无交易记录
          </div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-[#161b22]">
              <tr className="text-[#8b949e] border-b border-[#21262d]">
                <th className="px-3 py-1.5 text-left">#</th>
                <th className="px-3 py-1.5 text-left">方向</th>
                <th className="px-3 py-1.5 text-right">手数</th>
                <th className="px-3 py-1.5 text-right">开仓价</th>
                <th className="px-3 py-1.5 text-right">平仓价</th>
                <th className="px-3 py-1.5 text-right">止损</th>
                <th className="px-3 py-1.5 text-right">止盈</th>
                <th className="px-3 py-1.5 text-left">开仓时间</th>
                <th className="px-3 py-1.5 text-left">平仓时间</th>
                <th className="px-3 py-1.5 text-center">原因</th>
                <th className="px-3 py-1.5 text-right">盈亏($)</th>
              </tr>
            </thead>
            <tbody>
              {[...trades].reverse().map(t => (
                <tr
                  key={t.id}
                  className="border-b border-[#21262d] hover:bg-[#161b22] transition-colors"
                >
                  <td className="px-3 py-1.5 text-[#8b949e]">{t.id}</td>
                  <td className="px-3 py-1.5">
                    <span className={`font-bold ${t.direction === 'Buy' ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>
                      {t.direction === 'Buy' ? '▲ 多' : '▼ 空'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-white">{t.lot_size.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-white">{t.entry_price.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-white">{t.close_price.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-[#ef5350]">{t.sl.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right text-[#26a69a]">{t.tp.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-[#8b949e]">{fmt(t.entry_time)}</td>
                  <td className="px-3 py-1.5 text-[#8b949e]">{fmt(t.close_time)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`
                      px-1.5 py-0.5 rounded text-[10px] font-bold
                      ${t.close_reason === 'tp'          ? 'bg-[#26a69a]/20 text-[#26a69a]' : ''}
                      ${t.close_reason === 'sl'          ? 'bg-[#ef5350]/20 text-[#ef5350]' : ''}
                      ${t.close_reason === 'margin_call' ? 'bg-red-900/40 text-red-400'      : ''}
                      ${t.close_reason === 'data_end'    ? 'bg-gray-700/40 text-gray-400'    : ''}
                    `}>
                      {REASON_LABEL[t.close_reason] ?? t.close_reason}
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
