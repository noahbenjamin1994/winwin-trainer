'use client'

import { type Lang, tr } from '@/lib/i18n'

/**
 * Step control panel.
 * Requests time-step updates from backend and applies incremental bars.
 */

interface Props {
  lang: Lang
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

export default function StepControls({ lang, disabled, loading, onStep }: Props) {
  return (
    <div className="shrink-0 border-t border-[#1a1714] bg-[#080b10] px-3 py-2">
      <div className="flex flex-wrap items-center justify-center gap-1.5 md:gap-2">
        <span className="mr-1 text-[10px] uppercase tracking-widest text-[#3d3528] hidden md:inline">
          {tr(lang, 'stepForward')}
        </span>
        {STEPS.map(({ label, minutes }) => (
          <button
            key={minutes}
            onClick={() => onStep(minutes)}
            disabled={disabled || loading}
            className={`
              min-w-14 rounded px-4 py-2 text-xs font-bold font-mono transition-all md:min-w-16 md:px-5 md:text-sm
              ${disabled || loading
                ? 'cursor-not-allowed bg-[#0b0e14] text-[#1a1714]'
                : 'cursor-pointer bg-[#f0b429]/10 text-[#f0b429] hover:bg-[#f0b429] hover:text-black active:scale-95'
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
