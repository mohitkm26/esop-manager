'use client'
import AppShell from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase'
import { parseFlexDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function NewGrantPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [employees, setEmployees] = useState<any[]>([])
  const [saving, setSaving]       = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [createdGrantId, setCreatedGrantId] = useState<string | null>(null)
  const [error, setError]         = useState('')

  const [form, setForm] = useState({
    employee_id: '', grant_date: '', total_options: '',
    notes: '', status: 'active'
  })
  const [vestingRows, setVestingRows] = useState<{date:string,qty:string}[]>([
    {date:'',qty:''},{date:'',qty:''},{date:'',qty:''},{date:'',qty:''}
  ])

  useEffect(() => {
    supabase.from('employees').select('id,name,employee_code,personal_email')
      .order('name').then(({ data }) => setEmployees(data || []))
  }, [])

  function addVestingRow() {
    setVestingRows(r => [...r, {date:'',qty:''}])
  }

  function updateVestingRow(i: number, field: 'date'|'qty', val: string) {
    setVestingRows(rows => rows.map((r,j) => j===i ? {...r,[field]:val} : r))
  }

  async function save() {
    setError('')
    if (!form.employee_id)   { setError('Select an employee'); return }
    if (!form.grant_date)    { setError('Grant date required'); return }
    if (!form.total_options) { setError('Total options required'); return }

    const schedule = vestingRows
      .filter(r => r.date && r.qty)
      .map(r => ({ date: r.date, options_count: parseInt(r.qty) }))

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    // Get next grant number
    const { data: grantNum } = await supabase.rpc('next_grant_number')

    const { data: grant, error: gErr } = await supabase.from('grants').insert({
      grant_number:  grantNum,
      employee_id:   form.employee_id,
      grant_date:    form.grant_date,
      total_options: parseInt(form.total_options),
      notes:         form.notes || null,
      status:        form.status as any,
      created_by:    user?.id,
    }).select('id').single()

    if (gErr) { setError(gErr.message); setSaving(false); return }

    // Insert vesting events
    if (schedule.length) {
      await supabase.from('vesting_events').insert(
        schedule.map(ev => ({
          grant_id:     grant.id,
          employee_id:  form.employee_id,
          vest_date:    ev.date,
          options_count: ev.options_count,
          status:       new Date(ev.date) <= new Date() ? 'vested' : 'pending',
        }))
      )
    }

    setCreatedGrantId(grant.id)
    setSaving(false)
  }

  async function generateAndEmail() {
    if (!createdGrantId) return
    setSendingEmail(true)
    const res = await fetch('/api/grants/generate-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantId: createdGrantId })
    })
    const json = await res.json()
    setSendingEmail(false)
    if (json.success) {
      alert(`✅ Grant letter generated and ${json.emailed ? 'emailed to employee!' : 'saved (no email on file).'}`)
      router.push('/grants')
    } else {
      setError(json.error || 'Failed to generate letter')
    }
  }

  return (
    <AppShell>
      <div className="p-8 max-w-3xl">
        <div className="mb-7">
          <h1 className="page-title">Add New Grant</h1>
          <p className="text-muted text-sm mt-1">Enter grant details. You can generate and email the grant letter after saving.</p>
        </div>

        {!createdGrantId ? (
          <div className="card">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="col-span-2">
                <label className="label">Employee *</label>
                <select className="input" value={form.employee_id}
                  onChange={e => setForm(f => ({...f, employee_id: e.target.value}))}>
                  <option value="">Select employee...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} — {e.employee_code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Grant Date *</label>
                <input type="date" className="input" value={form.grant_date}
                  onChange={e => setForm(f => ({...f, grant_date: e.target.value}))} />
              </div>
              <div>
                <label className="label">Total Options *</label>
                <input type="number" className="input" placeholder="e.g. 1000" value={form.total_options}
                  onChange={e => setForm(f => ({...f, total_options: e.target.value}))} />
              </div>
              <div className="col-span-2">
                <label className="label">Notes</label>
                <textarea className="input" rows={2} placeholder="Any conditions, cliff period, etc."
                  value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
              </div>
            </div>

            <div className="border-t border-border pt-5 mb-4">
              <h2 className="section-title mb-3">Vesting Schedule</h2>
              <div className="space-y-2">
                {vestingRows.map((r,i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <input type="date" className="input flex-1" value={r.date}
                      onChange={e => updateVestingRow(i, 'date', e.target.value)} />
                    <input type="number" className="input w-36" placeholder="Options" value={r.qty}
                      onChange={e => updateVestingRow(i, 'qty', e.target.value)} />
                    <button onClick={() => setVestingRows(rows => rows.filter((_,j) => j!==i))}
                      className="text-muted hover:text-red text-lg">×</button>
                  </div>
                ))}
              </div>
              <button onClick={addVestingRow} className="btn btn-secondary btn-sm mt-3">+ Add Row</button>
            </div>

            {error && <p className="text-red text-sm mb-4">{error}</p>}
            <div className="flex gap-3">
              <button onClick={save} disabled={saving} className="btn btn-success">
                {saving ? '⏳ Saving...' : '💾 Save Grant'}
              </button>
              <button onClick={() => router.back()} className="btn btn-secondary">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="card text-center py-10">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="font-display font-bold text-xl mb-2">Grant Saved!</h2>
            <p className="text-muted mb-6">
              Now generate the grant letter PDF and send it to the employee's email.
            </p>
            {error && <p className="text-red text-sm mb-4">{error}</p>}
            <div className="flex gap-3 justify-center">
              <button onClick={generateAndEmail} disabled={sendingEmail} className="btn btn-primary">
                {sendingEmail ? '⏳ Generating & Sending...' : '📧 Generate Letter & Email Employee'}
              </button>
              <button onClick={() => router.push('/grants')} className="btn btn-secondary">
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
