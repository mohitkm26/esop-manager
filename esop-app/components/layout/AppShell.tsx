'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { Profile } from '@/types/database'
import { roleLabel } from '@/lib/utils'
import Link from 'next/link'

const NAV = [
  { href: '/dashboard',  icon: '📊', label: 'Dashboard' },
  { href: '/employees',  icon: '👥', label: 'Employees' },
  { href: '/grants',     icon: '📋', label: 'Grants' },
  { href: '/upload',     icon: '📑', label: 'Upload PDFs / CSV' },
  { href: '/valuation',  icon: '💰', label: 'Valuation' },
  { href: '/users',      icon: '🔐', label: 'User Management', adminOnly: true },
  { href: '/settings',   icon: '⚙️',  label: 'Settings' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [empCount, setEmpCount]   = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
      const { count } = await supabase.from('employees').select('*', { count: 'exact', head: true })
      setEmpCount(count || 0)
    }
    load()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const filteredNav = NAV.filter(n => !n.adminOnly || profile?.role === 'admin')

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-surface border-r border-border flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue to-green flex items-center justify-center text-lg flex-shrink-0">⚡</div>
            <div>
              <div className="font-display font-extrabold text-sm leading-tight">ESOP</div>
              <div className="text-[9px] text-muted font-mono tracking-widest">MANAGER</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {filteredNav.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold mb-0.5 transition-all ${
                  active
                    ? 'bg-blue/10 text-blue border border-blue/20'
                    : 'text-muted hover:bg-surface2 hover:text-white'
                }`}>
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        {profile && (
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2 mb-2 px-2">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} className="w-7 h-7 rounded-full flex-shrink-0" alt="" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue/20 flex items-center justify-center text-xs text-blue font-bold flex-shrink-0">
                  {profile.full_name?.[0] || profile.email[0].toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <div className="text-xs font-semibold truncate">{profile.full_name || profile.email}</div>
                <div className="text-[10px] text-muted">{roleLabel(profile.role)}</div>
              </div>
            </div>
            <div className="text-[10px] text-muted font-mono px-2 mb-2">{empCount} employees</div>
            <button onClick={signOut} className="w-full text-left text-xs text-muted hover:text-white px-2 py-1.5 rounded-lg hover:bg-surface2 transition-colors">
              🔒 Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-bg">
        {children}
      </main>
    </div>
  )
}
