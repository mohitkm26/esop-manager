import type { Metadata } from 'next'
import { Manrope, DM_Mono, Syne } from 'next/font/google'
import './globals.css'

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' })
const dmMono  = DM_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-dm-mono' })
const syne    = Syne({ subsets: ['latin'], variable: '--font-syne' })

export const metadata: Metadata = {
  title: 'ESOP Manager',
  description: 'Employee Stock Option Plan Management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmMono.variable} ${syne.variable}`}>
      <body className="bg-bg text-white font-sans antialiased">{children}</body>
    </html>
  )
}
