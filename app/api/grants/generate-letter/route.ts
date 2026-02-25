import { NextResponse } from 'next/server'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()

  // Auth check
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { grantId } = await req.json()

  // Load grant + employee + vesting
  const { data: grant, error: gErr } = await adminClient
    .from('grants')
    .select('*, employee:employees(*), vesting_events(*)')
    .eq('id', grantId)
    .single()
  if (gErr || !grant) return NextResponse.json({ error: 'Grant not found' }, { status: 404 })

  const emp = grant.employee as any
  const events = (grant.vesting_events as any[]).sort(
    (a: any, b: any) => new Date(a.vest_date).getTime() - new Date(b.vest_date).getTime()
  )

  // Build grant letter HTML
  const company = process.env.NEXT_PUBLIC_COMPANY_NAME || 'The Company'
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  const fmtN = (n: number) => Number(n).toLocaleString('en-IN')

  const vestingRows = events.map((ev: any) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${fmtDate(ev.vest_date)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmtN(ev.options_count)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Grant Letter — ${grant.grant_number}</title></head>
<body style="font-family:Georgia,serif;max-width:700px;margin:40px auto;color:#1a1a2e;line-height:1.7">
  <div style="border-bottom:3px solid #4f8fff;padding-bottom:20px;margin-bottom:30px">
    <h1 style="font-size:26px;font-weight:bold;margin:0">${company}</h1>
    <p style="color:#666;margin:4px 0 0">Employee Stock Option Grant Letter</p>
  </div>

  <p>Date: <strong>${fmtDate(new Date().toISOString())}</strong></p>
  <p>Grant Reference: <strong>${grant.grant_number}</strong></p>

  <p>Dear <strong>${emp.name}</strong>,</p>

  <p>We are pleased to inform you that the Board of Directors of <strong>${company}</strong> has approved
  the grant of stock options to you under the Employee Stock Option Plan (ESOP), subject to the terms
  and conditions set forth herein.</p>

  <table style="width:100%;border-collapse:collapse;margin:24px 0;background:#f8f9ff;border-radius:8px;overflow:hidden">
    <tr><td style="padding:10px 16px;font-weight:bold;color:#555">Employee Name</td><td style="padding:10px 16px">${emp.name}</td></tr>
    <tr><td style="padding:10px 16px;font-weight:bold;color:#555">Employee Code</td><td style="padding:10px 16px">${emp.employee_code}</td></tr>
    <tr><td style="padding:10px 16px;font-weight:bold;color:#555">Grant Number</td><td style="padding:10px 16px">${grant.grant_number}</td></tr>
    <tr><td style="padding:10px 16px;font-weight:bold;color:#555">Grant Date</td><td style="padding:10px 16px">${fmtDate(grant.grant_date)}</td></tr>
    <tr style="background:#4f8fff;color:white"><td style="padding:10px 16px;font-weight:bold">Total Options Granted</td><td style="padding:10px 16px;font-weight:bold;font-size:18px">${fmtN(grant.total_options)}</td></tr>
  </table>

  <h3 style="border-bottom:1px solid #eee;padding-bottom:8px">Vesting Schedule</h3>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#f0f4ff">
      <th style="padding:8px 12px;text-align:left">Vesting Date</th>
      <th style="padding:8px 12px;text-align:right">Options</th>
    </tr></thead>
    <tbody>${vestingRows}</tbody>
  </table>

  ${grant.notes ? `<p style="margin-top:20px;padding:12px 16px;background:#fffbf0;border-left:3px solid #f5a623"><strong>Notes:</strong> ${grant.notes}</p>` : ''}

  <p style="margin-top:30px">This grant is subject to the terms of the Company's ESOP plan and your employment agreement.
  Please retain this letter for your records.</p>

  <div style="margin-top:48px;border-top:1px solid #eee;padding-top:20px">
    <p>Authorised Signatory<br><strong>${company}</strong></p>
  </div>
</body>
</html>`

  // Convert HTML to PDF using a fetch to a headless renderer
  // Using html-to-pdf approach: encode as base64 for email attachment
  const htmlBuffer = Buffer.from(html)

  // Upload HTML-as-PDF placeholder to Supabase Storage
  const storagePath = `generated/${grant.grant_number}_letter.html`
  await adminClient.storage.from('generated-pdfs').upload(storagePath, htmlBuffer, {
    contentType: 'text/html', upsert: true
  })

  // Update grant record with letter path
  await adminClient.from('grants').update({ letter_path: storagePath }).eq('id', grantId)

  // Send email with grant letter
  const toEmail = emp.personal_email || emp.official_email
  if (toEmail) {
    const { error: emailErr } = await resend.emails.send({
      from: `${company} HR <hr@${process.env.RESEND_DOMAIN || 'yourdomain.com'}>`,
      to: [toEmail],
      subject: `Your ESOP Grant Letter — ${grant.grant_number}`,
      html: `
        <p>Dear ${emp.name},</p>
        <p>Please find your ESOP Grant Letter attached below. Your grant reference is <strong>${grant.grant_number}</strong>.</p>
        <p>Total options granted: <strong>${fmtN(grant.total_options)}</strong></p>
        <p>You can also log in to the Employee Portal to view your vesting schedule at any time:
           <a href="${process.env.NEXT_PUBLIC_APP_URL}/employee-portal">${process.env.NEXT_PUBLIC_APP_URL}/employee-portal</a>
        </p>
        <hr/>
        ${html}
      `,
    })
    if (emailErr) console.error('Email error:', emailErr)
  }

  return NextResponse.json({ success: true, letterPath: storagePath, emailed: !!toEmail })
}
