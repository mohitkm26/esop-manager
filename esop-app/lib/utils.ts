import { VestingEvent, VestingComputed } from '@/types/database'

export function fmtN(n: number) {
  return Number(n || 0).toLocaleString('en-IN')
}

export function fmtC(n: number) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function today() {
  const d = new Date(); d.setHours(0,0,0,0); return d
}

export function computeVesting(
  events: VestingEvent[],
  totalOptions: number,
  fairValue: number = 0,
  asOf?: string
): VestingComputed {
  const cutoff = asOf ? new Date(asOf) : today()
  let vested = 0, lapsed = 0, unvested = 0

  events.forEach(ev => {
    const d = new Date(ev.vest_date)
    if (ev.status === 'lapsed') { lapsed += ev.options_count }
    else if (d <= cutoff)       { vested += ev.options_count }
    else                        { unvested += ev.options_count }
  })

  const total = totalOptions
  const vestedValue = vested * fairValue
  const pct = total > 0 ? Math.round((vested / total) * 100) : 0
  return { total, vested, lapsed, unvested, vestedValue, pct }
}

export function parseFlexDate(s: string): string | null {
  if (!s?.trim()) return null
  s = s.trim()
  const monMap: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
  }
  const m1 = s.match(/^(\d{1,2})[-\/](\w{3})[-\/](\d{2,4})$/i)
  if (m1) {
    const mon = monMap[m1[2].toLowerCase()]
    if (!mon) return null
    let yr = parseInt(m1[3])
    if (yr < 100) yr += yr < 50 ? 2000 : 1900
    return `${yr}-${mon}-${m1[1].padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

export function parseVestingStr(str: string): Array<{date: string, quantity: number}> {
  if (!str) return []
  return str.split(',').map(s => s.trim()).filter(Boolean).flatMap(pair => {
    const m = pair.match(/^([\d\-A-Za-z]+)\s*:\s*(\d+)$/)
    if (!m) return []
    const d = parseFlexDate(m[1].trim())
    const q = parseInt(m[2])
    return d && q ? [{ date: d, quantity: q }] : []
  }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function getLatestValuation(valuations: Array<{effective_date: string, fair_value: number}>, asOf?: string) {
  const cutoff = asOf || new Date().toISOString().split('T')[0]
  const valid = valuations
    .filter(v => v.effective_date <= cutoff)
    .sort((a,b) => b.effective_date.localeCompare(a.effective_date))
  return valid[0]?.fair_value || 0
}

export function downloadCSV(rows: any[][], filename: string) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}

export function extractGrantNumberFromFilename(filename: string): string | null {
  // Match G-0001, G0001, GRANT-0001 at start of filename
  const m = filename.match(/^(G-?\d{4})/i)
  return m ? m[1].toUpperCase().replace(/^G(\d)/, 'G-$1') : null
}

export function roleLabel(role: string) {
  return { admin: '👑 Admin', editor: '✏️ Editor', viewer: '👁 Viewer' }[role] || role
}

export function roleCanWrite(role: string) { return ['admin','editor'].includes(role) }
export function roleCanDelete(role: string) { return role === 'admin' }
export function roleCanManageUsers(role: string) { return role === 'admin' }
export function roleCanSetValuation(role: string) { return role === 'admin' }
export function roleCanDownload(role: string) { return ['admin','editor','viewer'].includes(role) }
