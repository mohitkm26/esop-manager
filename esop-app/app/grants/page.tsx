import { createServerSupabaseClient } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { fmtN, fmtDate, computeVesting, getLatestValuation, fmtC } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function GrantsPage() {
  const supabase = createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const role = profile?.role || 'viewer'

  const [{ data: grants }, { data: valuations }] = await Promise.all([
    supabase.from('grants')
      .select('*, employee:employees(name,employee_code,exit_date), vesting_events(*)')
      .order('grant_number'),
    supabase.from('valuations').select('*').order('effective_date', { ascending: false }),
  ])

  const fairValue = getLatestValuation(valuations || [])

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">Grants</h1>
            <p className="text-muted text-sm mt-1">{grants?.length || 0} grants across all employees</p>
          </div>
          {['admin','editor'].includes(role) && (
            <Link href="/grants/new" className="btn btn-success">+ Add Grant</Link>
          )}
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="w-full">
              <thead className="bg-surface2">
                <tr>
                  <th className="th">Grant #</th>
                  <th className="th">Employee</th>
                  <th className="th">Code</th>
                  <th className="th">Grant Date</th>
                  <th className="th">Total</th>
                  <th className="th">Vested</th>
                  <th className="th">Unvested</th>
                  <th className="th">Progress</th>
                  {fairValue > 0 && <th className="th">Value</th>}
                  <th className="th">Letter</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {(grants || []).map(g => {
                  const emp = g.employee as any
                  const v   = computeVesting(g.vesting_events as any[], g.total_options, fairValue)
                  return (
                    <tr key={g.id} className="hover:bg-surface/50">
                      <td className="td">
                        <Link href={`/grants/${g.id}`} className="badge badge-blue hover:underline font-mono">
                          {g.grant_number}
                        </Link>
                      </td>
                      <td className="td font-semibold">
                        <Link href={`/employees/${g.employee_id}`} className="hover:text-blue transition-colors">
                          {emp?.name || '—'}
                        </Link>
                      </td>
                      <td className="td td-mono text-muted">{emp?.employee_code}</td>
                      <td className="td td-mono">{fmtDate(g.grant_date)}</td>
                      <td className="td td-mono text-blue">{fmtN(g.total_options)}</td>
                      <td className="td td-mono text-green">{fmtN(v.vested)}</td>
                      <td className="td td-mono text-purple">{fmtN(v.unvested)}</td>
                      <td className="td" style={{minWidth: 100}}>
                        <div className="text-[10px] text-muted mb-1">{v.pct}%</div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{width:`${v.pct}%`}} />
                        </div>
                      </td>
                      {fairValue > 0 && (
                        <td className="td td-mono text-amber">{fmtC(v.vestedValue)}</td>
                      )}
                      <td className="td">
                        {g.letter_path
                          ? <span className="badge badge-green text-xs">📄 On file</span>
                          : <span className="badge badge-amber text-xs">Missing</span>}
                      </td>
                      <td className="td">
                        <span className={`badge ${
                          emp?.exit_date ? 'badge-red' : g.status === 'active' ? 'badge-green' : 'badge-amber'
                        }`}>
                          {emp?.exit_date ? 'Exited' : g.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {(!grants || grants.length === 0) && (
            <div className="text-center py-12 text-muted">
              <div className="text-4xl mb-3">📋</div>
              <p>No grants yet. <Link href="/upload" className="text-blue hover:underline">Upload data to get started.</Link></p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
