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
    <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-[#21262d] bg-[#161b22] shrink-0">
      <span className="text-[#8b949e] text-xs mr-2">时间推演</span>
      {STEPS.map(({ label, minutes }) => (
        <button
          key={minutes}
          onClick={() => onStep(minutes)}
          disabled={disabled || loading}
          className={`
            px-5 py-1.5 rounded border text-sm font-mono font-bold transition-all
            ${disabled || loading
              ? 'border-[#30363d] text-[#30363d] cursor-not-allowed'
              : 'border-[#f0b429] text-[#f0b429] hover:bg-[#f0b429] hover:text-black cursor-pointer'
            }
          `}
        >
          {loading ? '…' : label}
        </button>
      ))}
    </div>
  )
}
