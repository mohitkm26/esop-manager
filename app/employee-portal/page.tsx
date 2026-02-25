'use client'
import { createClient } from '@/lib/supabase'
import { computeVesting, fmtN, fmtC, fmtDate, getLatestValuation } from '@/lib/utils'
import { useState } from 'react'

export default function EmployeePortalPage() {
  const supabase = createClient()
  const [code, setCode]     = useState('')
  const [empData, setEmpData] = useState<any>(null)
  const [valuations, setValuations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  async function lookup() {
    setError(''); setEmpData(null); setLoading(true)
    if (!code.trim()) { setError('Please enter your employee code'); setLoading(false); return }

    const { data: emp } = await supabase
      .from('employees')
      .select('*, grants(*, vesting_events(*))')
      .eq('employee_code', code.trim().toUpperCase())
      .single()

    if (!emp) { setError('Employee code not found. Contact your HR admin.'); setLoading(false); return }

    const { data: vals } = await supabase.from('valuations').select('*').order('effective_date', { ascending: false })
    setValuations(vals || [])
    setEmpData(emp)
    setLoading(false)
  }

  const fairValue = getLatestValuation(valuations)
  const company = process.env.NEXT_PUBLIC_COMPANY_NAME || 'ESOP Manager'

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue to-green flex items-center justify-center">⚡</div>
          <div>
            <div className="font-display font-bold text-sm">{company}</div>
            <div className="text-[10px] text-muted font-mono tracking-widest">EMPLOYEE PORTAL</div>
          </div>
        </div>
        <a href="/login" className="text-xs text-muted hover:text-white transition-colors">Admin login →</a>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Lookup form */}
        {!empData && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-sm">
              <div className="text-center mb-8">
                <div className="text-5xl mb-4">👤</div>
                <h1 className="font-display font-bold text-2xl mb-2">View Your ESOP Grants</h1>
                <p className="text-muted text-sm">Enter your employee code to see your vesting details</p>
              </div>
              <div className="card">
                <label className="label">Your Employee Code</label>
                <input className="input mb-4" placeholder="e.g. XIN005"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && lookup()}
                />
                {error && <p className="text-red text-sm mb-3">{error}</p>}
                <button onClick={lookup} disabled={loading}
                  className="btn btn-success w-full justify-center">
                  {loading ? '⏳ Looking up...' : '🔍 View My Grants'}
                </button>
                <p className="text-xs text-muted text-center mt-3">
                  You can only see your own data. No password needed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Employee data */}
        {empData && (
          <>
            {/* Employee header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="font-display font-bold text-3xl">{empData.name}</h1>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="badge badge-blue">{empData.employee_code}</span>
                  {empData.department && <span className="badge badge-blue">{empData.department}</span>}
                  {empData.exit_date
                    ? <span className="badge badge-red">Exited {fmtDate(empData.exit_date)}</span>
                    : <span className="badge badge-green">Active</span>}
                </div>
              </div>
              <button onClick={() => { setEmpData(null); setCode('') }}
                className="btn btn-secondary btn-sm">← Back</button>
            </div>

            {/* Overall summary */}
            {(() => {
              const allEvents = (empData.grants || []).flatMap((g: any) => g.vesting_events || [])
              const totalOptions = (empData.grants || []).reduce((s: number, g: any) => s + g.total_options, 0)
              const v = computeVesting(allEvents, totalOptions, fairValue)
              return (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="card">
                    <div className="stat-label">Total Options Granted</div>
                    <div className="stat-value text-blue">{fmtN(v.total)}</div>
                    <div className="text-xs text-muted mt-1">{empData.grants?.length || 0} grant(s)</div>
                  </div>
                  <div className="card">
                    <div className="stat-label">Total Vested</div>
                    <div className="stat-value text-green">{fmtN(v.vested)}</div>
                    {fairValue > 0 && <div className="text-xs text-green mt-1">{fmtC(v.vestedValue)} at ₹{fairValue}/option</div>}
                  </div>
                  <div className="card-sm">
                    <div className="stat-label">Unvested</div>
                    <div className="font-display font-bold text-xl text-amber">{fmtN(v.unvested)}</div>
                  </div>
                  <div className="card-sm">
                    <div className="stat-label">Lapsed</div>
                    <div className="font-display font-bold text-xl text-red">{fmtN(v.lapsed)}</div>
                  </div>
                </div>
              )
            })()}

            {/* Per-grant breakdown */}
            <h2 className="font-display font-bold text-lg mb-3">Your Grants</h2>
            {(empData.grants || []).map((grant: any) => {
              const v = computeVesting(grant.vesting_events || [], grant.total_options, fairValue)
              const events = [...(grant.vesting_events || [])].sort(
                (a: any, b: any) => new Date(a.vest_date).getTime() - new Date(b.vest_date).getTime()
              )
              return (
                <div key={grant.id} className="card mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="badge badge-blue text-sm px-3 py-1">{grant.grant_number}</span>
                      <span className="text-muted text-sm">Granted {fmtDate(grant.grant_date)}</span>
                    </div>
                    <span className="font-display font-bold text-xl text-blue">{fmtN(grant.total_options)} options</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'Vested', value: v.vested, color: 'green' },
                      { label: 'Unvested', value: v.unvested, color: 'amber' },
                      { label: 'Lapsed', value: v.lapsed, color: 'red' },
                    ].map(s => (
                      <div key={s.label} className={`bg-${s.color}/10 rounded-xl p-3 text-center`}>
                        <div className="stat-label">{s.label}</div>
                        <div className={`font-display font-bold text-xl text-${s.color}`}>{fmtN(s.value)}</div>
                        {s.label === 'Vested' && fairValue > 0 && (
                          <div className={`text-xs text-${s.color} mt-0.5`}>{fmtC(s.value * fairValue)}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="progress-bar h-2 mb-1">
                    <div className="progress-fill" style={{width:`${v.pct}%`}} />
                  </div>
                  <div className="text-xs text-muted mb-4">{v.pct}% vested</div>

                  {/* Vesting timeline */}
                  <div className="text-[10px] text-muted font-mono tracking-widest uppercase mb-2">Vesting Schedule</div>
                  <div className="space-y-1">
                    {events.map((ev: any) => {
                      const status = ev.status === 'lapsed' ? 'lapsed'
                        : new Date(ev.vest_date) <= new Date() ? 'vested' : 'pending'
                      return (
                        <div key={ev.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              status==='vested'?'bg-green':status==='lapsed'?'bg-red':'bg-amber'
                            }`} />
                            <span className="text-sm font-mono text-muted">{fmtDate(ev.vest_date)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold">{fmtN(ev.options_count)}</span>
                            {fairValue > 0 && <span className="text-xs text-muted">{fmtC(ev.options_count * fairValue)}</span>}
                            <span className={`badge text-[10px] ${
                              status==='vested'?'badge-green':status==='lapsed'?'badge-red':'badge-amber'
                            }`}>{status}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {grant.notes && (
                    <div className="mt-3 bg-amber/5 border border-amber/20 rounded-lg p-3 text-xs text-muted">
                      📋 {grant.notes}
                    </div>
                  )}
                </div>
              )
            })}

            <p className="text-xs text-muted text-center mt-6">
              Data shown as of today. Contact HR for any questions.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
