import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'XAUUSD 盘感训练系统',
  description: '黄金期货/CFD 交易演练平台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
