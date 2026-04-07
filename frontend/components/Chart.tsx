'use client'

/**
 * K-line chart component (TradingView Lightweight Charts v4).
 * - setData(): full load (initial / timeframe switch)
 * - updateBars(): incremental update (time stepping)
 * - Includes volume histogram overlay
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
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { OHLCBar, Timeframe } from '@/lib/types'
import { type Lang, tr } from '@/lib/i18n'

export interface ChartRef {
  /** Set full K-line dataset. */
  setData: (bars: OHLCBar[]) => void
  /** Incrementally update bars. */
  updateBars: (bars: OHLCBar[]) => void
}

interface Props {
  lang: Lang
  timeframe: Timeframe
  orderLevels: { sl: number; tp: number } | null
  onTimeframeChange: (tf: Timeframe) => void
}

const TIMEFRAMES: Timeframe[] = ['1M', '5M', '15M', '1H', '4H', '1D']

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
  { lang, timeframe, orderLevels, onTimeframeChange },
  ref,
) {

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const containerRef  = useRef<HTMLDivElement>(null)
  const chartRef      = useRef<IChartApi | null>(null)
  const candleRef     = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef     = useRef<ISeriesApi<'Histogram'> | null>(null)
  const slLineRef     = useRef<IPriceLine | null>(null)
  const tpLineRef     = useRef<IPriceLine | null>(null)



  useEffect(() => {
    if (!mounted || !containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#080b10' },
        textColor:  '#554d3d',
        fontSize:   11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#12100d' },
        horzLines: { color: '#12100d' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#1a1714',
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor:  '#1a1714',
        timeVisible:  true,
        secondsVisible: false,
        barSpacing: 6,
      },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })


    const candleSeries = chart.addCandlestickSeries({
      upColor:     '#26a69a',
      downColor:   '#ef5350',
      borderVisible: false,
      wickUpColor:   '#26a69a',
      wickDownColor: '#ef5350',
    })


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
      if (candleRef.current && slLineRef.current) {
        candleRef.current.removePriceLine(slLineRef.current)
      }
      if (candleRef.current && tpLineRef.current) {
        candleRef.current.removePriceLine(tpLineRef.current)
      }
      slLineRef.current = null
      tpLineRef.current = null
      ro.disconnect()
      chart.remove()
      chartRef.current  = null
      candleRef.current = null
      volumeRef.current = null
    }
  }, [mounted])


  const setData = useCallback((bars: OHLCBar[]) => {
    if (!candleRef.current || !volumeRef.current) return
    candleRef.current.setData(bars.map(toCandle))
    volumeRef.current.setData(bars.map(toVolume))

    chartRef.current?.timeScale().scrollToRealTime()
  }, [])

  const updateBars = useCallback((bars: OHLCBar[]) => {
    if (!candleRef.current || !volumeRef.current || bars.length === 0) return
    for (const bar of bars) {

      candleRef.current.update(toCandle(bar))
      volumeRef.current.update(toVolume(bar))
    }
    chartRef.current?.timeScale().scrollToRealTime()
  }, [])

  useImperativeHandle(ref, () => ({ setData, updateBars }), [setData, updateBars])


  useEffect(() => {
    if (!candleRef.current) return

    if (slLineRef.current) {
      candleRef.current.removePriceLine(slLineRef.current)
      slLineRef.current = null
    }
    if (tpLineRef.current) {
      candleRef.current.removePriceLine(tpLineRef.current)
      tpLineRef.current = null
    }

    if (!orderLevels) return
    if (!Number.isFinite(orderLevels.sl) || !Number.isFinite(orderLevels.tp)) return

    slLineRef.current = candleRef.current.createPriceLine({
      price: orderLevels.sl,
      color: '#ef5350',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'SL',
    })

    tpLineRef.current = candleRef.current.createPriceLine({
      price: orderLevels.tp,
      color: '#26a69a',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'TP',
    })
  }, [orderLevels])

  return (
    <div className="flex flex-col h-full">
      
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#1a1714] bg-[#0b0e14] px-3 py-1.5 shrink-0">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => onTimeframeChange(tf)}
            className={`
              shrink-0 rounded px-3 py-0.5 text-xs font-mono transition-colors
              ${timeframe === tf
                ? 'bg-[#f0b429] text-black font-bold'
                : 'text-[#554d3d] hover:text-white hover:bg-[#12100d]'
              }
            `}
          >
            {tf}
          </button>
        ))}
        <span className="ml-auto shrink-0 text-[10px] text-[#3d3528]">{tr(lang, 'instrumentUnit')}</span>
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="ml-2 shrink-0 text-[10px] text-[#3d3528] underline hover:text-white"
        >
          Powered by TradingView
        </a>
      </div>

      
      <div ref={containerRef} className="flex-1 w-full">
        {!mounted && (
          <div className="flex items-center justify-center h-full text-[#2a2520] text-xs">
            {tr(lang, 'loadingChart')}
          </div>
        )}
      </div>
    </div>
  )
})

export default Chart
