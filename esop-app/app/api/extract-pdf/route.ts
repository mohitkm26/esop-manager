import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: Request) {
  // Verify auth
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { b64, filename } = await req.json()
  if (!b64) return NextResponse.json({ error: 'No PDF data' }, { status: 400 })

  const prompt = `Extract ALL data from this ESOP grant letter PDF.
Return ONLY a valid JSON object, no markdown, no extra text:
{
  "name": "Full employee name",
  "ecode": "Employee code/ID",
  "totalOptions": 1000,
  "grantDate": "YYYY-MM-DD",
  "email": "personal email or null",
  "officialEmail": "company email or null",
  "phone": "phone or null",
  "department": "dept or null",
  "exitDate": null,
  "vestingSchedule": [{"date":"YYYY-MM-DD","quantity":250}],
  "notes": "conditions or null"
}
Rules: convert all dates to YYYY-MM-DD, convert % vesting to actual counts, list every vesting event, return null for missing fields.`

  const MAX_RETRIES = 4
  let lastErr: string = ''

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * Math.pow(2, attempt - 1)))

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      })

      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get('retry-after') || '0')
        await new Promise(r => setTimeout(r, Math.max(retryAfter * 1000, 8000)))
        lastErr = 'Rate limited'; continue
      }

      if (!resp.ok) {
        const e = await resp.json()
        throw new Error(e.error?.message || `API ${resp.status}`)
      }

      const data = await resp.json()
      const text = data.content?.map((c: any) => c.text || '').join('') || ''
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      return NextResponse.json(parsed)
    } catch (err: any) {
      lastErr = err.message
      if (err.message?.includes('API 4') && !err.message?.includes('429')) break
    }
  }

  return NextResponse.json({ error: lastErr || 'Extraction failed' }, { status: 500 })
}
