'use client'

/**
 * 推演控制台
 * 点击按钮后，向后端请求步进，获取增量K线并更新图表
 */

interface Props {
  disabled: boolean
  loading: boolean
  onStep: (minutes: 1 | 5 | 15 | 60) => void
}

const STEPS: { label: string; minutes: 1 | 5 | 15 | 60 }[] = [
  { label: '+1M',  minutes: 1  },
  { label: '+5M',  minutes: 5  },
  { label: '+15M', minutes: 15 },
  { label: '+1H',  minutes: 60 },
]

export default function StepControls({ disabled, loading, onStep }: Props) {
  return (
    <div className="shrink-0 border-t border-[#21262d] bg-[#161b22] px-3 py-2">
      <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
        <span className="w-full text-center text-[11px] text-[#8b949e] md:mr-2 md:w-auto md:text-xs">
          时间推演
        </span>
        {STEPS.map(({ label, minutes }) => (
          <button
            key={minutes}
            onClick={() => onStep(minutes)}
            disabled={disabled || loading}
            className={`
              min-w-16 rounded border px-4 py-1.5 text-xs font-bold font-mono transition-all md:px-5 md:text-sm
              ${disabled || loading
                ? 'cursor-not-allowed border-[#30363d] text-[#30363d]'
                : 'cursor-pointer border-[#f0b429] text-[#f0b429] hover:bg-[#f0b429] hover:text-black'
              }
            `}
          >
            {loading ? '…' : label}
          </button>
        ))}
      </div>
    </div>
  )
}
