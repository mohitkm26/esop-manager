'use client'
import AppShell from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase'
import { fmtC, fmtDate, roleCanSetValuation } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { Valuation } from '@/types/database'

export default function ValuationPage() {
  const supabase = createClient()
  const [valuations, setValuations] = useState<Valuation[]>([])
  const [role, setRole]             = useState('')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState({ effective_date: '', fair_value: '', note: '' })
  const [error, setError]           = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(p?.role || '')
    }
    const { data } = await supabase.from('valuations').select('*').order('effective_date', { ascending: false })
    setValuations(data || [])
    setLoading(false)
  }

  async function save() {
    setError('')
    const fv = parseFloat(form.fair_value)
    if (!form.effective_date) { setError('Effective date is required'); return }
    if (!fv || fv <= 0)       { setError('Fair value must be a positive number'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: e } = await supabase.from('valuations').upsert({
      effective_date: form.effective_date,
      fair_value: fv,
      note: form.note || null,
      created_by: user?.id,
    }, { onConflict: 'effective_date' })
    if (e) { setError(e.message); setSaving(false); return }
    setForm({ effective_date: '', fair_value: '', note: '' })
    await load()
    setSaving(false)
  }

  async function deleteValuation(id: string) {
    if (!confirm('Delete this valuation entry?')) return
    await supabase.from('valuations').delete().eq('id', id)
    await load()
  }

  const canEdit = roleCanSetValuation(role)
  const latest  = valuations[0]

  return (
    <AppShell>
      <div className="p-8 max-w-3xl">
        <div className="mb-7">
          <h1 className="page-title">Valuation</h1>
          <p className="text-muted text-sm mt-1">Track fair value per option over time. Each date is a separate snapshot.</p>
        </div>

        {/* Current value */}
        {latest && (
          <div className="card mb-6 flex items-center gap-6">
            <div>
              <div className="stat-label">Current Fair Value</div>
              <div className="font-display font-bold text-4xl text-amber">{fmtC(latest.fair_value)}<span className="text-lg text-muted font-sans"> / option</span></div>
            </div>
            <div className="border-l border-border pl-6">
              <div className="stat-label">Effective From</div>
              <div className="font-semibold text-lg">{fmtDate(latest.effective_date)}</div>
              {latest.note && <div className="text-xs text-muted mt-1">{latest.note}</div>}
            </div>
          </div>
        )}

        {/* Add new (admin only) */}
        {canEdit && (
          <div className="card mb-6">
            <h2 className="section-title mb-4">Add / Update Valuation</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="label">Effective Date *</label>
                <input type="date" className="input" value={form.effective_date}
                  onChange={e => setForm(f => ({...f, effective_date: e.target.value}))} />
              </div>
              <div>
                <label className="label">Fair Value (₹ per option) *</label>
                <input type="number" className="input" placeholder="e.g. 150.00" step="0.01"
                  value={form.fair_value}
                  onChange={e => setForm(f => ({...f, fair_value: e.target.value}))} />
              </div>
              <div>
                <label className="label">Note</label>
                <input type="text" className="input" placeholder="Board approved, 409A..." value={form.note}
                  onChange={e => setForm(f => ({...f, note: e.target.value}))} />
              </div>
            </div>
            {error && <p className="text-red text-sm mb-3">{error}</p>}
            <button onClick={save} disabled={saving} className="btn btn-success">
              {saving ? '⏳ Saving...' : '💾 Save Valuation'}
            </button>
            <p className="text-xs text-muted mt-2">If a valuation already exists for this date, it will be updated.</p>
          </div>
        )}

        {/* History table */}
        <div className="card">
          <h2 className="section-title mb-4">Valuation History</h2>
          {loading ? (
            <div className="text-center py-8 text-muted">Loading...</div>
          ) : valuations.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <div className="text-3xl mb-2">💰</div>
              No valuations recorded yet.{canEdit && ' Add one above.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="w-full">
                <thead className="bg-surface2">
                  <tr>
                    <th className="th">Effective Date</th>
                    <th className="th">Fair Value / Option</th>
                    <th className="th">Note</th>
                    <th className="th">Added</th>
                    {canEdit && <th className="th"></th>}
                  </tr>
                </thead>
                <tbody>
                  {valuations.map((v, i) => (
                    <tr key={v.id} className={i === 0 ? 'bg-amber/5' : ''}>
                      <td className="td td-mono font-semibold">
                        {fmtDate(v.effective_date)}
                        {i === 0 && <span className="badge badge-amber ml-2">Current</span>}
                      </td>
                      <td className="td font-display font-bold text-amber text-lg">{fmtC(v.fair_value)}</td>
                      <td className="td text-muted text-sm">{v.note || '—'}</td>
                      <td className="td td-mono text-muted text-xs">{fmtDate(v.created_at)}</td>
                      {canEdit && (
                        <td className="td">
                          <button onClick={() => deleteValuation(v.id)}
                            className="text-muted hover:text-red text-xs transition-colors">
                            🗑 Delete
                          </button>
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
