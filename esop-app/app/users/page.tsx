'use client'
import AppShell from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase'
import { roleLabel, roleCanManageUsers } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { Profile, UserRole } from '@/types/database'

const ROLES: UserRole[] = ['admin', 'editor', 'viewer']
const ROLE_DESC = {
  admin:  'Full access: add, edit, delete, download, set valuation, manage users',
  editor: 'Add & edit records, upload PDFs/CSV, download data. Cannot delete or manage users.',
  viewer: 'Read-only access. Can view all data and download reports.',
}

export default function UsersPage() {
  const supabase = createClient()
  const [users, setUsers]     = useState<Profile[]>([])
  const [myRole, setMyRole]   = useState('')
  const [myId, setMyId]       = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setMyId(user?.id || '')
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
    setMyRole(me?.role || '')
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsers(data || [])
    setLoading(false)
  }

  async function updateRole(userId: string, role: UserRole) {
    setSaving(userId)
    await supabase.from('profiles').update({ role }).eq('id', userId)
    await load()
    setSaving(null)
  }

  async function toggleActive(user: Profile) {
    if (user.id === myId) { alert("You can't deactivate your own account"); return }
    setSaving(user.id)
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    await load()
    setSaving(null)
  }

  const canManage = roleCanManageUsers(myRole)

  return (
    <AppShell>
      <div className="p-8">
        <div className="mb-7">
          <h1 className="page-title">User Management</h1>
          <p className="text-muted text-sm mt-1">
            Users sign in with Google. Assign roles here after they log in for the first time.
          </p>
        </div>

        {/* Role descriptions */}
        <div className="grid grid-cols-3 gap-4 mb-7">
          {ROLES.map(r => (
            <div key={r} className="card-sm border-l-2" style={{borderLeftColor: r==='admin'?'#f5a623':r==='editor'?'#4f8fff':'#5a6178'}}>
              <div className="font-semibold text-sm mb-1">{roleLabel(r)}</div>
              <div className="text-xs text-muted leading-relaxed">{ROLE_DESC[r]}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">All Users ({users.length})</h2>
            <p className="text-xs text-muted">New users appear here after their first Google sign-in</p>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted">Loading...</div>
          ) : (
            <div className="table-wrap">
              <table className="w-full">
                <thead className="bg-surface2">
                  <tr>
                    <th className="th">User</th>
                    <th className="th">Email</th>
                    <th className="th">Role</th>
                    <th className="th">Status</th>
                    <th className="th">Joined</th>
                    {canManage && <th className="th">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className={u.id === myId ? 'bg-blue/5' : ''}>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          {u.avatar_url
                            ? <img src={u.avatar_url} className="w-7 h-7 rounded-full" alt="" />
                            : <div className="w-7 h-7 rounded-full bg-blue/20 text-blue text-xs font-bold flex items-center justify-center">
                                {u.full_name?.[0] || u.email[0].toUpperCase()}
                              </div>
                          }
                          <div>
                            <div className="font-semibold text-sm">{u.full_name || '—'}</div>
                            {u.id === myId && <div className="text-[10px] text-blue">You</div>}
                          </div>
                        </div>
                      </td>
                      <td className="td text-sm text-muted">{u.email}</td>
                      <td className="td">
                        {canManage && u.id !== myId ? (
                          <select
                            value={u.role}
                            disabled={saving === u.id}
                            onChange={e => updateRole(u.id, e.target.value as UserRole)}
                            className="input text-xs py-1 px-2 w-28"
                          >
                            {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                          </select>
                        ) : (
                          <span className={`badge ${u.role==='admin'?'badge-amber':u.role==='editor'?'badge-blue':'badge-purple'}`}>
                            {roleLabel(u.role)}
                          </span>
                        )}
                      </td>
                      <td className="td">
                        <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                          {u.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="td td-mono text-muted text-xs">
                        {new Date(u.created_at).toLocaleDateString('en-IN')}
                      </td>
                      {canManage && (
                        <td className="td">
                          {u.id !== myId && (
                            <button
                              onClick={() => toggleActive(u)}
                              disabled={saving === u.id}
                              className={`text-xs transition-colors ${u.is_active ? 'text-muted hover:text-red' : 'text-muted hover:text-green'}`}
                            >
                              {saving === u.id ? '...' : u.is_active ? '⛔ Suspend' : '✅ Activate'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
