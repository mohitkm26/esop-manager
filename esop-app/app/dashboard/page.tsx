import { createServerSupabaseClient } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { computeVesting, fmtN, fmtC, fmtDate, getLatestValuation } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient()

  const [
    { data: employees },
    { data: grants },
    { data: vestingEvents },
    { data: valuations },
  ] = await Promise.all([
    supabase.from('employees').select('*'),
    supabase.from('grants').select('*').eq('status','active'),
    supabase.from('vesting_events').select('*'),
    supabase.from('valuations').select('*').order('effective_date', { ascending: false }),
  ])

  const fairValue = getLatestValuation(valuations || [])
  const currentValuation = valuations?.[0]

  // Aggregate totals
  let totalGranted = 0, totalVested = 0, totalLapsed = 0, totalUnvested = 0
  const grantMap = new Map<string, typeof vestingEvents>()
  ;(vestingEvents || []).forEach(ev => {
    if (!grantMap.has(ev.grant_id)) grantMap.set(ev.grant_id, [])
    grantMap.get(ev.grant_id)!.push(ev)
  })

  ;(grants || []).forEach(g => {
    const evs = grantMap.get(g.id) || []
    const v = computeVesting(evs, g.total_options, fairValue)
    totalGranted  += v.total
    totalVested   += v.vested
    totalLapsed   += v.lapsed
    totalUnvested += v.unvested
  })

  const activeEmp = (employees || []).filter(e => !e.exit_date).length
  const exitedEmp = (employees || []).length - activeEmp

  // Per-employee for table
  const empRows = (employees || []).map(emp => {
    const empGrants = (grants || []).filter(g => g.employee_id === emp.id)
    let ev = 0, la = 0, un = 0, tot = 0
    empGrants.forEach(g => {
      const evs = grantMap.get(g.id) || []
      const v = computeVesting(evs, g.total_options, fairValue)
      ev += v.vested; la += v.lapsed; un += v.unvested; tot += v.total
    })
    return { ...emp, vested: ev, lapsed: la, unvested: un, total: tot, grants: empGrants.length }
  }).sort((a,b) => b.total - a.total)

  return (
    <AppShell>
      <div className="p-8">
        <div className="mb-7">
          <h1 className="page-title">Dashboard</h1>
          <p className="text-muted text-sm mt-1">Real-time ESOP position as of today</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
          {[
            { label: 'Total Granted', value: fmtN(totalGranted), sub: `${(grants||[]).length} grants`, color: 'blue' },
            { label: 'Vested', value: fmtN(totalVested), sub: fairValue ? fmtC(totalVested * fairValue) : 'Set valuation for value', color: 'green' },
            { label: 'Lapsed', value: fmtN(totalLapsed), sub: 'Post-exit forfeit', color: 'red' },
            { label: 'Unvested Pipeline', value: fmtN(totalUnvested), sub: `${activeEmp} active · ${exitedEmp} exited`, color: 'purple' },
          ].map(s => (
            <div key={s.label} className={`card relative overflow-hidden before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:bg-${s.color}`}>
              <div className="stat-label">{s.label}</div>
              <div className={`stat-value text-${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted mt-1.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Valuation banner */}
        {currentValuation && (
          <div className="card mb-7 flex items-center justify-between">
            <div>
              <div className="stat-label">Current Fair Value per Option</div>
              <div className="font-display font-bold text-2xl text-amber">{fmtC(currentValuation.fair_value)}</div>
              <div className="text-xs text-muted mt-1">Effective {fmtDate(currentValuation.effective_date)} · {currentValuation.note}</div>
            </div>
            <div className="text-right">
              <div className="stat-label">Total Vested Value</div>
              <div className="font-display font-bold text-2xl text-green">{fmtC(totalVested * fairValue)}</div>
              <Link href="/valuation" className="text-xs text-blue hover:underline mt-1 block">Manage valuations →</Link>
            </div>
          </div>
        )}

        {/* Employee table */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Outstanding Position</h2>
            <Link href="/employees" className="text-xs text-blue hover:underline">View all →</Link>
          </div>
          {empRows.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <div className="text-4xl mb-3">📂</div>
              <div>No data yet. <Link href="/upload" className="text-blue hover:underline">Upload grant data</Link></div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="w-full">
                <thead className="bg-surface2">
                  <tr>
                    {['Employee','Code','Status','Grants','Granted','Vested','Lapsed','Unvested',fairValue?'Value':''].filter(Boolean).map(h => (
                      <th key={h} className="th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empRows.map(e => (
                    <tr key={e.id} className="hover:bg-surface/50 cursor-pointer" onClick={() => {}}>
                      <td className="td font-semibold">{e.name}</td>
                      <td className="td td-mono text-muted">{e.employee_code}</td>
                      <td className="td">
                        {e.exit_date
                          ? <span className="badge badge-red">Exited</span>
                          : <span className="badge badge-green">Active</span>}
                      </td>
                      <td className="td td-mono text-center">{e.grants}</td>
                      <td className="td td-mono text-blue">{fmtN(e.total)}</td>
                      <td className="td td-mono text-green">{fmtN(e.vested)}</td>
                      <td className="td td-mono text-red">{fmtN(e.lapsed)}</td>
                      <td className="td td-mono text-purple">{fmtN(e.unvested)}</td>
                      {fairValue && <td className="td td-mono text-amber">{fmtC(e.vested * fairValue)}</td>}
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
