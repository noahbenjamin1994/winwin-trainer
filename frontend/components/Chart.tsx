'use client'

/**
 * K 线图表组件（使用 TradingView Lightweight Charts v4）
 * ─────────────────────────────────────────────────────
 * 功能：
 *   1. 初始化时调用 setData() 加载全量历史K线
 *   2. 步进时调用 update() 平滑添加新K线（不重载）
 *   3. 切换周期时重新调用 setData() 加载新周期数据
 *   4. 成交量柱状图叠加在同一图表中
 */

import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useState,
} from 'react'
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { OHLCBar, Timeframe } from '@/lib/types'

// ── 图表方法对外暴露接口 ──────────────────────────────────
export interface ChartRef {
  /** 全量设置 K 线数据（切换周期或初始加载时调用） */
  setData: (bars: OHLCBar[]) => void
  /** 增量更新（步进时追加新K线） */
  updateBars: (bars: OHLCBar[]) => void
}

interface Props {
  timeframe: Timeframe
  onTimeframeChange: (tf: Timeframe) => void
}

const TIMEFRAMES: Timeframe[] = ['1M', '5M', '15M', '1H', '4H', '1D']

// 将 OHLCBar 转成 lightweight-charts 所需格式
function toCandle(bar: OHLCBar): CandlestickData {
  return {
    time:  bar.time as UTCTimestamp,
    open:  bar.open,
    high:  bar.high,
    low:   bar.low,
    close: bar.close,
  }
}

function toVolume(bar: OHLCBar): HistogramData {
  return {
    time:  bar.time as UTCTimestamp,
    value: bar.volume,
    color: bar.close >= bar.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
  }
}

const Chart = forwardRef<ChartRef, Props>(function Chart(
  { timeframe, onTimeframeChange },
  ref,
) {
  // mounted 守卫：lightweight-charts 依赖 window/DOM，不能在 SSR 期间初始化
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const containerRef  = useRef<HTMLDivElement>(null)
  const chartRef      = useRef<IChartApi | null>(null)
  const candleRef     = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef     = useRef<ISeriesApi<'Histogram'> | null>(null)

  // ── 初始化图表（仅 mount 时执行一次）──────────────────
  // 必须等 mounted=true 后才能初始化（依赖 DOM + window）
  useEffect(() => {
    if (!mounted || !containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor:  '#8b949e',
        fontSize:   11,
        attributionLogo: false, // 使用自定义文字归因，避免图表内悬浮图标
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#30363d',
        scaleMargins: { top: 0.08, bottom: 0.25 },  // 为成交量留出底部空间
      },
      timeScale: {
        borderColor:  '#30363d',
        timeVisible:  true,
        secondsVisible: false,
        barSpacing: 6,
      },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    // 阳线/阴线K线序列
    const candleSeries = chart.addCandlestickSeries({
      upColor:     '#26a69a',
      downColor:   '#ef5350',
      borderVisible: false,
      wickUpColor:   '#26a69a',
      wickDownColor: '#ef5350',
    })

    // 成交量柱状图（独立价格轴，叠加在底部20%）
    const volumeSeries = chart.addHistogramSeries({
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    chartRef.current  = chart
    candleRef.current = candleSeries
    volumeRef.current = volumeSeries

    // 响应式尺寸调整
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({
          width:  entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current  = null
      candleRef.current = null
      volumeRef.current = null
    }
  }, [mounted])  // mounted 变为 true 时触发一次初始化

  // ── 对外暴露方法 ─────────────────────────────────────
  const setData = useCallback((bars: OHLCBar[]) => {
    if (!candleRef.current || !volumeRef.current) return
    candleRef.current.setData(bars.map(toCandle))
    volumeRef.current.setData(bars.map(toVolume))
    // 图表时间轴自动滚动到最右侧（最新K线）
    chartRef.current?.timeScale().scrollToRealTime()
  }, [])

  const updateBars = useCallback((bars: OHLCBar[]) => {
    if (!candleRef.current || !volumeRef.current || bars.length === 0) return
    for (const bar of bars) {
      // update() 语义：若 time > 最后一根则追加，否则更新最后一根
      candleRef.current.update(toCandle(bar))
      volumeRef.current.update(toVolume(bar))
    }
    chartRef.current?.timeScale().scrollToRealTime()
  }, [])

  useImperativeHandle(ref, () => ({ setData, updateBars }), [setData, updateBars])

  return (
    <div className="flex flex-col h-full">
      {/* 周期切换栏 */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#21262d] bg-[#161b22] px-3 py-1.5 shrink-0">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            className={`
              shrink-0 rounded px-3 py-0.5 text-xs font-mono transition-colors
              ${timeframe === tf
                ? 'bg-[#f0b429] text-black font-bold'
                : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'
              }
            `}
          >
            {tf}
          </button>
        ))}
        <span className="ml-auto shrink-0 text-[10px] text-[#8b949e]">XAUUSD · USD/盎司</span>
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="ml-2 shrink-0 text-[10px] text-[#8b949e] underline hover:text-white"
        >
          Powered by TradingView
        </a>
      </div>

      {/* 图表容器：flex-1 撑满剩余高度。未挂载时显示占位，避免 createChart 在 SSR 执行 */}
      <div ref={containerRef} className="flex-1 w-full">
        {!mounted && (
          <div className="flex items-center justify-center h-full text-[#30363d] text-xs">
            Loading chart…
          </div>
        )}
      </div>
    </div>
  )
})

export default Chart
