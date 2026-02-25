import { createServerSupabaseClient } from '@/lib/supabase'
import AppShell from '@/components/layout/AppShell'
import { fmtN, fmtDate, computeVesting, getLatestValuation, fmtC } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function EmployeesPage() {
  const supabase = createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const role = profile?.role || 'viewer'

  const [{ data: employees }, { data: valuations }] = await Promise.all([
    supabase.from('employees')
      .select('*, grants(id, grant_number, total_options, grant_date, status, vesting_events(*))')
      .order('name'),
    supabase.from('valuations').select('*').order('effective_date', { ascending: false }),
  ])

  const fairValue = getLatestValuation(valuations || [])

  const rows = (employees || []).map(emp => {
    const grants = emp.grants as any[] || []
    let vested = 0, lapsed = 0, unvested = 0, total = 0
    grants.forEach(g => {
      const v = computeVesting(g.vesting_events || [], g.total_options, fairValue)
      vested += v.vested; lapsed += v.lapsed; unvested += v.unvested; total += v.total
    })
    const pct = total > 0 ? Math.round((vested / total) * 100) : 0
    return { ...emp, vested, lapsed, unvested, total, pct, grantCount: grants.length }
  })

  return (
    <AppShell>
      <div className="p-8">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">Employees</h1>
            <p className="text-muted text-sm mt-1">{rows.length} employees · {rows.filter(e => !e.exit_date).length} active</p>
          </div>
          <div className="flex gap-2">
            {['admin','editor'].includes(role) && (
              <Link href="/employees/new" className="btn btn-success">+ Add Employee</Link>
            )}
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            <table className="w-full">
              <thead className="bg-surface2">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Code</th>
                  <th className="th">Department</th>
                  <th className="th">Status</th>
                  <th className="th">Grants</th>
                  <th className="th">Total</th>
                  <th className="th">Vested</th>
                  <th className="th">Progress</th>
                  {fairValue > 0 && <th className="th">Value</th>}
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(emp => (
                  <tr key={emp.id} className="hover:bg-surface/50">
                    <td className="td">
                      <Link href={`/employees/${emp.id}`} className="font-semibold hover:text-blue transition-colors">
                        {emp.name}
                      </Link>
                    </td>
                    <td className="td td-mono text-muted">{emp.employee_code}</td>
                    <td className="td text-sm text-muted">{emp.department || '—'}</td>
                    <td className="td">
                      {emp.exit_date
                        ? <span className="badge badge-red">Exited {fmtDate(emp.exit_date)}</span>
                        : <span className="badge badge-green">Active</span>}
                    </td>
                    <td className="td td-mono text-center">{emp.grantCount}</td>
                    <td className="td td-mono text-blue">{fmtN(emp.total)}</td>
                    <td className="td td-mono text-green">{fmtN(emp.vested)}</td>
                    <td className="td" style={{minWidth: 120}}>
                      <div className="text-[10px] text-muted mb-1">{emp.pct}%</div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{width:`${emp.pct}%`}} />
                      </div>
                    </td>
                    {fairValue > 0 && (
                      <td className="td td-mono text-amber">{fmtC(emp.vested * fairValue)}</td>
                    )}
                    <td className="td">
                      <Link href={`/employees/${emp.id}`} className="text-blue text-xs hover:underline">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div className="text-center py-12 text-muted">
              <div className="text-4xl mb-3">👥</div>
              <p>No employees yet. <Link href="/upload" className="text-blue hover:underline">Upload data to get started.</Link></p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
