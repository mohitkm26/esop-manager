import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function POST(req: Request) {
  const supabase = createAdminClient()
  const { grants, userId } = await req.json()

  let added = 0, newEmployees = 0, errors: string[] = []

  for (const g of grants) {
    try {
      // 1. Find or create employee
      let empId: string
      const { data: existing } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_code', g.ecode)
        .single()

      if (existing) {
        empId = existing.id
        // Update exit date if newly provided
        if (g.exitDate) {
          await supabase.from('employees')
            .update({ exit_date: g.exitDate })
            .eq('id', empId)
        }
      } else {
        const { data: newEmp, error: empErr } = await supabase
          .from('employees')
          .insert({
            name: g.name, employee_code: g.ecode,
            personal_email: g.email || null,
            official_email: g.officialEmail || null,
            phone: g.phone || null,
            department: g.department || null,
            exit_date: g.exitDate || null,
            created_by: userId,
          })
          .select('id').single()
        if (empErr) throw new Error(empErr.message)
        empId = newEmp.id
        newEmployees++
      }

      // 2. Generate grant number
      const { data: gnData } = await supabase.rpc('next_grant_number')
      const grantNumber = gnData as string

      // 3. Create grant
      const { data: grant, error: grantErr } = await supabase
        .from('grants')
        .insert({
          grant_number: grantNumber,
          employee_id: empId,
          grant_date: g.grantDate,
          total_options: g.totalOptions,
          source_file: g._sourceFile || g._fileName || null,
          notes: g.notes || null,
          created_by: userId,
        })
        .select('id').single()
      if (grantErr) throw new Error(grantErr.message)

      // 4. Create vesting events
      if (g.vestingSchedule?.length) {
        const events = g.vestingSchedule.map((ev: any) => ({
          grant_id: grant.id,
          employee_id: empId,
          vest_date: ev.date,
          options_count: ev.quantity,
          status: new Date(ev.date) <= new Date() ? 'vested' : 'pending',
        }))
        const { error: vestErr } = await supabase.from('vesting_events').insert(events)
        if (vestErr) throw new Error(vestErr.message)
      }

      added++
    } catch (err: any) {
      errors.push(`${g.name || g.ecode}: ${err.message}`)
    }
  }

  return NextResponse.json({ added, newEmployees, errors })
}
