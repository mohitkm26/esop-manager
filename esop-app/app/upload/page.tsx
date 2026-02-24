'use client'
import AppShell from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase'
import { parseFlexDate, parseVestingStr, extractGrantNumberFromFilename, fmtDate, fmtN } from '@/lib/utils'
import { useEffect, useState, useRef } from 'react'

type Tab = 'pdf' | 'csv' | 'letters'

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>('pdf')
  const supabase = createClient()
  const [userId, setUserId] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || ''))
  }, [])

  return (
    <AppShell>
      <div className="p-8">
        <div className="mb-7">
          <h1 className="page-title">Upload Data</h1>
          <p className="text-muted text-sm mt-1">Three ways to get data in: AI PDF extraction, CSV bulk import, or bulk grant letter upload.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {([
            { key: 'pdf',     label: '🤖 PDF Extraction (AI)',      sub: 'Uses Claude API' },
            { key: 'csv',     label: '📊 CSV Bulk Import',           sub: 'Free, instant' },
            { key: 'letters', label: '📎 Bulk Grant Letters',        sub: 'Upload PDFs by grant no.' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all text-left ${
                tab === t.key ? 'bg-blue/15 text-blue border border-blue/30' : 'bg-surface text-muted hover:text-white border border-border'
              }`}>
              <div>{t.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5">{t.sub}</div>
            </button>
          ))}
        </div>

        {tab === 'pdf'     && <PDFExtractor userId={userId} />}
        {tab === 'csv'     && <CSVImporter userId={userId} />}
        {tab === 'letters' && <GrantLetterUploader userId={userId} />}
      </div>
    </AppShell>
  )
}

// ── PDF EXTRACTOR ─────────────────────────────────────────────────────────
function PDFExtractor({ userId }: { userId: string }) {
  const [files, setFiles]         = useState<File[]>([])
  const [step, setStep]           = useState<'upload'|'processing'|'review'>('upload')
  const [extracted, setExtracted] = useState<any[]>([])
  const [progress, setProgress]   = useState({ done: 0, total: 0, failed: 0 })
  const supabase = createClient()

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return
    const pdfs = [...fileList].filter(f => f.name.endsWith('.pdf'))
    const existingNames = new Set(files.map(f => f.name))
    const newFiles = pdfs.filter(f => !existingNames.has(f.name))
    setFiles(prev => [...prev, ...newFiles])
    if (pdfs.length < fileList.length) alert(`${fileList.length - pdfs.length} non-PDF files were skipped`)
  }

  async function startExtraction() {
    setStep('processing')
    setProgress({ done: 0, total: files.length, failed: 0 })
    const results: any[] = []

    const CONCURRENCY = 3
    const queue = [...files.entries()]
    const workers = Array(CONCURRENCY).fill(null).map(async () => {
      while (queue.length) {
        const [i, f] = queue.shift()!
        try {
          const b64 = await fileToBase64(f)
          const res = await fetch('/api/extract-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ b64, filename: f.name })
          })
          const json = await res.json()
          if (json.error) throw new Error(json.error)
          results.push({ ...json, _fileName: f.name, _ok: true })
        } catch (err: any) {
          results.push({ _fileName: f.name, _ok: false, _error: err.message })
          setProgress(p => ({ ...p, failed: p.failed + 1 }))
        }
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }
    })
    await Promise.all(workers)
    setExtracted(results)
    setStep('review')
  }

  async function saveAll() {
    const good = extracted.filter(e => e._ok && e.name && e.totalOptions)
    const res = await fetch('/api/grants/bulk-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grants: good, userId })
    })
    const json = await res.json()
    alert(`✅ Saved: ${json.added} grants, ${json.newEmployees} new employees`)
    setFiles([]); setExtracted([]); setStep('upload')
  }

  return (
    <div className="max-w-3xl">
      {step === 'upload' && (
        <>
          <div className="card mb-4">
            <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-border2 rounded-xl cursor-pointer hover:border-blue transition-colors"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}>
              <input type="file" accept=".pdf" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              <div className="text-4xl mb-2">📂</div>
              <div className="font-semibold">Drop PDF grant letters here or click to browse</div>
              <div className="text-xs text-muted mt-1">Select multiple files at once</div>
            </label>
          </div>
          {files.length > 0 && (
            <div className="card">
              <div className="flex justify-between items-center mb-3">
                <div className="font-semibold">{files.length} files ready</div>
                <button onClick={startExtraction} className="btn btn-success">✨ Extract with Claude AI</button>
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {files.map((f,i) => (
                  <div key={i} className="flex justify-between items-center bg-surface2 rounded-lg px-3 py-2">
                    <span className="text-sm text-muted font-mono">📄 {f.name}</span>
                    <button onClick={() => setFiles(fs => fs.filter((_,j) => j!==i))}
                      className="text-muted hover:text-red text-xs">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {step === 'processing' && (
        <div className="card">
          <div className="font-semibold mb-3">⚙️ Extracting — {progress.done} / {progress.total}{progress.failed > 0 ? ` (${progress.failed} failed)` : ''}</div>
          <div className="progress-bar mb-4 h-2">
            <div className="progress-fill" style={{width: `${progress.total ? (progress.done/progress.total)*100 : 0}%`}} />
          </div>
          <p className="text-sm text-muted">Processing 3 files at a time with automatic retry on rate limits...</p>
        </div>
      )}

      {step === 'review' && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="section-title">Review {extracted.filter(e=>e._ok).length} extracted grants</h2>
            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="btn btn-secondary btn-sm">↺ Re-upload</button>
              <button onClick={saveAll} className="btn btn-success">💾 Save All</button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="w-full">
              <thead className="bg-surface2"><tr>
                <th className="th">File</th><th className="th">Name</th><th className="th">Code</th>
                <th className="th">Options</th><th className="th">Grant Date</th><th className="th">Status</th>
              </tr></thead>
              <tbody>
                {extracted.map((e,i) => (
                  <tr key={i} className={e._ok ? '' : 'opacity-50'}>
                    <td className="td td-mono text-muted text-xs">{e._fileName}</td>
                    <td className="td font-semibold">{e.name || '—'}</td>
                    <td className="td td-mono">{e.ecode || '—'}</td>
                    <td className="td td-mono text-blue">{e.totalOptions ? fmtN(e.totalOptions) : '—'}</td>
                    <td className="td td-mono">{e.grantDate ? fmtDate(e.grantDate) : '—'}</td>
                    <td className="td">
                      {e._ok
                        ? <span className="badge badge-green">✅ OK</span>
                        : <span className="badge badge-red" title={e._error}>❌ Failed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CSV IMPORTER ──────────────────────────────────────────────────────────
function CSVImporter({ userId }: { userId: string }) {
  const [rows, setRows]       = useState<any[]>([])
  const [step, setStep]       = useState<'upload'|'preview'>('upload')
  const [saving, setSaving]   = useState(false)
  const supabase = createClient()

  function handleFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseCSV(text, file.name)
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function saveAll() {
    setSaving(true)
    const good = rows.filter(r => r._errors.length === 0)
    const res = await fetch('/api/grants/bulk-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grants: good, userId })
    })
    const json = await res.json()
    alert(`✅ Saved: ${json.added} grants, ${json.newEmployees} new employees, ${rows.length - good.length} skipped`)
    setSaving(false)
    setRows([]); setStep('upload')
  }

  const good = rows.filter(r => r._errors.length === 0)
  const bad  = rows.filter(r => r._errors.length > 0)

  return (
    <div className="max-w-4xl">
      {step === 'upload' && (
        <>
          <div className="card mb-4">
            <div className="font-semibold text-sm mb-2">Expected columns:</div>
            <div className="bg-bg rounded-lg p-3 font-mono text-xs text-muted overflow-x-auto whitespace-nowrap mb-3">
              name, employee_code, personal_email, official_email, phone, department, grant_date, total_options, exit_date, notes, vesting_schedule
            </div>
            <div className="text-xs text-muted">
              Vesting schedule format: <code className="bg-surface2 px-1 rounded">2024-09-30:250, 2025-09-30:250</code> &nbsp;|&nbsp;
              Date format: <code className="bg-surface2 px-1 rounded">01-Oct-23</code> or <code className="bg-surface2 px-1 rounded">2023-10-01</code>
            </div>
          </div>
          <div className="card">
            <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-border2 rounded-xl cursor-pointer hover:border-blue transition-colors">
              <input type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files?.[0] || null)} />
              <div className="text-4xl mb-2">📊</div>
              <div className="font-semibold">Drop CSV file here or click to browse</div>
            </label>
          </div>
        </>
      )}

      {step === 'preview' && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="section-title">{good.length} valid rows · {bad.length} skipped</h2>
              {bad.length > 0 && (
                <div className="text-xs text-red mt-1">
                  Issues: {bad.map(r => `${r.name || r.ecode}: ${r._errors.join(', ')}`).join(' | ')}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="btn btn-secondary btn-sm">↺ Re-upload</button>
              <button onClick={saveAll} disabled={saving || good.length === 0} className="btn btn-success">
                {saving ? '⏳ Saving...' : '💾 Save to Database'}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="w-full">
              <thead className="bg-surface2"><tr>
                <th className="th">Name</th><th className="th">Code</th><th className="th">Options</th>
                <th className="th">Grant Date</th><th className="th">Vesting Events</th><th className="th">Status</th>
              </tr></thead>
              <tbody>
                {rows.map((r,i) => (
                  <tr key={i} className={r._errors.length ? 'opacity-50' : ''}>
                    <td className="td font-semibold">{r.name || '—'}</td>
                    <td className="td td-mono">{r.ecode || '—'}</td>
                    <td className="td td-mono text-blue">{r.totalOptions ? fmtN(r.totalOptions) : '—'}</td>
                    <td className="td td-mono">{r.grantDate ? fmtDate(r.grantDate) : '—'}</td>
                    <td className="td td-mono">{r.vestingSchedule?.length || 0}</td>
                    <td className="td">
                      {r._errors.length === 0
                        ? <span className="badge badge-green">✅ Valid</span>
                        : <span className="badge badge-red" title={r._errors.join(', ')}>⚠ {r._errors[0]}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── GRANT LETTER UPLOADER ─────────────────────────────────────────────────
function GrantLetterUploader({ userId }: { userId: string }) {
  const [files, setFiles]   = useState<File[]>([])
  const [results, setResults] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const supabase = createClient()

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return
    const pdfs = [...fileList].filter(f => f.name.endsWith('.pdf'))
    setFiles(pdfs)
  }

  async function upload() {
    setUploading(true)
    const uploadResults: any[] = []

    for (const file of files) {
      const grantNum = extractGrantNumberFromFilename(file.name)
      const path = `letters/${Date.now()}_${file.name.replace(/\s/g,'_')}`

      try {
        const { error: upErr } = await supabase.storage
          .from('grant-letters').upload(path, file)
        if (upErr) throw upErr

        // Find matching grant in DB
        const { data: grant } = grantNum
          ? await supabase.from('grants').select('id,grant_number,employee_id').eq('grant_number', grantNum).single()
          : { data: null }

        // Save to grant_letters table
        await supabase.from('grant_letters').insert({
          grant_id: grant?.id || null,
          grant_number: grantNum,
          storage_path: path,
          filename: file.name,
          file_size: file.size,
          matched: !!grant,
          uploaded_by: userId,
        })

        // If matched, update grant record
        if (grant) {
          await supabase.from('grants').update({ letter_path: path, source_file: file.name }).eq('id', grant.id)
        }

        uploadResults.push({ file: file.name, grantNum, matched: !!grant, grant, ok: true })
      } catch (err: any) {
        uploadResults.push({ file: file.name, grantNum, matched: false, ok: false, error: err.message })
      }
    }

    setResults(uploadResults)
    setUploading(false)
  }

  return (
    <div className="max-w-3xl">
      <div className="card mb-4">
        <h2 className="section-title mb-2">📎 Bulk Grant Letter Upload</h2>
        <p className="text-sm text-muted mb-3">
          Name your PDF files starting with the grant number (e.g. <code className="bg-surface2 px-1 rounded">G-0042_Priya_Sharma.pdf</code>).
          The system will automatically match each file to the correct grant record.
        </p>
        <label className="flex flex-col items-center justify-center h-36 border-2 border-dashed border-border2 rounded-xl cursor-pointer hover:border-blue transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}>
          <input type="file" accept=".pdf" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
          <div className="text-3xl mb-2">📎</div>
          <div className="font-semibold text-sm">Drop PDFs here or click to browse</div>
          <div className="text-xs text-muted mt-1">Files should start with grant number: G-0001_...</div>
        </label>
      </div>

      {files.length > 0 && results.length === 0 && (
        <div className="card mb-4">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold">{files.length} files selected</span>
            <button onClick={upload} disabled={uploading} className="btn btn-success">
              {uploading ? '⏳ Uploading...' : '⬆ Upload All'}
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {files.map((f,i) => {
              const gn = extractGrantNumberFromFilename(f.name)
              return (
                <div key={i} className="flex justify-between items-center bg-surface2 rounded-lg px-3 py-2">
                  <span className="text-sm font-mono text-muted">📄 {f.name}</span>
                  <span className={`badge text-xs ${gn ? 'badge-green' : 'badge-amber'}`}>
                    {gn ? gn : '⚠ No grant # detected'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="section-title">Upload Results</h2>
            <div className="text-xs text-muted">
              {results.filter(r=>r.matched).length} matched · {results.filter(r=>!r.matched&&r.ok).length} unmatched · {results.filter(r=>!r.ok).length} failed
            </div>
          </div>
          <div className="table-wrap">
            <table className="w-full">
              <thead className="bg-surface2"><tr>
                <th className="th">Filename</th><th className="th">Grant #</th><th className="th">Result</th>
              </tr></thead>
              <tbody>
                {results.map((r,i) => (
                  <tr key={i}>
                    <td className="td td-mono text-xs text-muted">{r.file}</td>
                    <td className="td td-mono">{r.grantNum || <span className="text-amber">Not detected</span>}</td>
                    <td className="td">
                      {!r.ok
                        ? <span className="badge badge-red">❌ {r.error}</span>
                        : r.matched
                          ? <span className="badge badge-green">✅ Matched to {r.grant?.grant_number}</span>
                          : <span className="badge badge-amber">📤 Uploaded (no matching grant)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => { setFiles([]); setResults([]) }} className="btn btn-secondary btn-sm mt-4">Upload More</button>
        </div>
      )}
    </div>
  )
}

// ── CSV parser (client-side) ───────────────────────────────────────────────
function parseCSV(text: string, fileName: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.split(',').every(c => !c.trim()))
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'))
  const COL: Record<string,number> = {}
  headers.forEach((h,i) => COL[h] = i)

  return lines.slice(1).map(line => {
    const cells = smartSplit(line)
    const get = (k: string) => (cells[COL[k] ?? -1] || '').trim()

    const name       = get('name')
    const ecode      = get('employee_code') || get('ecode')
    const grantDate  = parseFlexDate(get('grant_date'))
    const exitDate   = get('exit_date') ? parseFlexDate(get('exit_date')) : null
    const total      = parseInt(get('total_options')) || 0

    let vestStr = get('vesting_schedule')
    if (!vestStr && cells.length > 10) vestStr = cells.slice(10).filter(Boolean).join(',')
    const vestingSchedule = parseVestingStr(vestStr)

    const _errors: string[] = []
    if (!name)       _errors.push('Missing name')
    if (!ecode)      _errors.push('Missing code')
    if (!grantDate)  _errors.push('Invalid grant date')
    if (!total)      _errors.push('Missing total options')

    return {
      name, ecode, grantDate, exitDate, totalOptions: total,
      email: get('personal_email'), officialEmail: get('official_email'),
      phone: get('phone').replace(/["]/g,''), department: get('department'),
      notes: get('notes'), vestingSchedule,
      _sourceFile: fileName, _errors
    }
  })
}

function smartSplit(line: string) {
  const result: string[] = []
  let cur = '', inQ = false
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue }
    cur += c
  }
  result.push(cur)
  return result
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = e => res((e.target!.result as string).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}
