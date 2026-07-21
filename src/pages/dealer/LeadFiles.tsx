import { useState, useRef, useCallback } from 'react'
import { read, utils } from 'xlsx'
import { Upload, FileText, CheckCircle, XCircle, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { parseExcelDate, autoDetectMapping, computeNextServiceDate, ColumnMapping, EMPTY_MAPPING, FIELD_LABELS } from '../../lib/excelUtils'
import { useLeadFiles } from '../../hooks/useLeadFiles'

interface ParsedRow { [key: string]: unknown }
type Step = 'idle' | 'mapping' | 'uploading' | 'done'
interface State {
  step: Step
  headers: string[]
  rows: ParsedRow[]
  mapping: ColumnMapping
  fileName: string
  progress: number
  total: number
  failed: number
  error: string | null
}

const INIT: State = { step: 'idle', headers: [], rows: [], mapping: EMPTY_MAPPING, fileName: '', progress: 0, total: 0, failed: 0, error: null }

export default function LeadFiles() {
  const { profile } = useAuth()
  const { files, refresh } = useLeadFiles()
  const [state, setState] = useState<State>(INIT)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = read(e.target!.result, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: ParsedRow[] = utils.sheet_to_json(ws, { defval: '', raw: true })
        if (!raw.length) { setState((s) => ({ ...s, error: 'File is empty.' })); return }
        const headers = Object.keys(raw[0])
        setState({ step: 'mapping', headers, rows: raw, mapping: autoDetectMapping(headers), fileName: file.name, progress: 0, total: raw.length, failed: 0, error: null })
      } catch { setState((s) => ({ ...s, error: 'Failed to read file.' })) }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  async function startUpload() {
    if (!profile?.dealer_id) return
    setState((s) => ({ ...s, step: 'uploading', progress: 0, failed: 0, error: null }))

    const { data: fileRecord, error: fileErr } = await supabase
      .from('lead_files')
      .insert({ dealer_id: profile.dealer_id, file_name: state.fileName, original_name: state.fileName, total_records: state.rows.length, uploaded_by: profile.id })
      .select()
      .single()

    if (fileErr || !fileRecord) { setState((s) => ({ ...s, step: 'done', error: 'Failed to create file record: ' + fileErr?.message })); return }

    const { mapping, rows } = state
    const BATCH = 50
    let uploaded = 0, failed = 0

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const mappedCols = new Set(Object.values(mapping).filter(Boolean))

      const leadsToInsert = batch.map((row, idx) => {
        const extra: Record<string, string> = {}
        for (const [k, v] of Object.entries(row)) {
          if (!mappedCols.has(k) && v !== '' && v !== null && v !== undefined) extra[k] = String(v)
        }
        const get = (col: string): string | null =>
          col && row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '' ? String(row[col]).trim() : null

        const lastServiceDate = parseExcelDate(mapping.service_pending_date ? row[mapping.service_pending_date] : null)
        const nextServiceDate = parseExcelDate(mapping.next_service_date ? row[mapping.next_service_date] : null) ?? computeNextServiceDate(lastServiceDate)

        return {
          dealer_id: profile.dealer_id!,
          file_id: fileRecord.id,
          customer_name: get(mapping.customer_name),
          phone: get(mapping.phone),
          vehicle_number: get(mapping.vehicle_number),
          vehicle_model: get(mapping.vehicle_model),
          service_type: get(mapping.service_type),
          service_pending_date: lastServiceDate,
          insurance_expiry_date: parseExcelDate(mapping.insurance_expiry_date ? row[mapping.insurance_expiry_date] : null),
          address: get(mapping.address),
          email: get(mapping.email),
          next_service_date: nextServiceDate,
          next_service_type: get(mapping.next_service_type),
          extra_data: Object.keys(extra).length > 0 ? extra : null,
          status: 'pending',
          sort_order: i + idx,
        }
      })

      const { error: insertErr } = await supabase.from('leads').insert(leadsToInsert)
      if (insertErr) { console.error('Batch insert error:', insertErr); failed += batch.length }
      else uploaded += batch.length
      setState((s) => ({ ...s, progress: Math.min(i + BATCH, rows.length), failed }))
    }

    await supabase.from('lead_files').update({ total_records: uploaded }).eq('id', fileRecord.id)
    setState((s) => ({ ...s, step: 'done' }))
    refresh()
  }

  function reset() { setState(INIT); if (fileRef.current) fileRef.current.value = '' }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Lead Files</h1>

      {state.step === 'idle' && (
        <div
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 cursor-pointer transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 font-medium">Drop your Excel / CSV file here</p>
          <p className="text-gray-400 text-sm mt-1">or click to browse</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
      )}

      {state.step === 'mapping' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center gap-3">
            <FileText className="text-blue-600" size={20} />
            <div>
              <p className="font-semibold text-gray-900">{state.fileName}</p>
              <p className="text-sm text-gray-500">{state.rows.length} rows · {state.headers.length} columns</p>
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Column Mapping — auto-detected. Adjust if needed.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(FIELD_LABELS) as Array<keyof ColumnMapping>).map((field) => (
                <div key={field} className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 w-44 shrink-0">{FIELD_LABELS[field]}</label>
                  <div className="relative flex-1">
                    <select
                      value={state.mapping[field]}
                      onChange={(e) => setState((s) => ({ ...s, mapping: { ...s.mapping, [field]: e.target.value } }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">— not mapped —</option>
                      {state.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700 border border-blue-100">
              If "Next Service Date" is not in your file, it is auto-calculated as Last Service Date + 3 months.
            </div>
          </div>
          <div className="p-5 border-t border-gray-100 flex gap-3 justify-end">
            <button onClick={reset} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={startUpload} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Upload {state.rows.length} Leads</button>
          </div>
        </div>
      )}

      {state.step === 'uploading' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="font-medium text-gray-900">Uploading leads...</p>
          <p className="text-gray-500 text-sm mt-1">{state.progress} / {state.total} rows</p>
          <div className="mt-4 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-600 h-2 transition-all" style={{ width: `${state.total > 0 ? (state.progress / state.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {state.step === 'done' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          {state.failed === state.total && state.total > 0 ? (
            <><XCircle className="mx-auto h-12 w-12 text-red-500 mb-3" /><p className="font-semibold text-lg text-gray-900">Upload Failed</p></>
          ) : (
            <><CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-3" /><p className="font-semibold text-lg text-gray-900">Upload Complete</p><p className="text-gray-500 text-sm mt-1">{state.total - state.failed} leads uploaded{state.failed > 0 && ` · ${state.failed} failed`}</p></>
          )}
          {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
          <button onClick={reset} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Upload Another File</button>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Uploaded Files</h2>
        {files.length === 0 && <p className="text-gray-500 text-sm">No files uploaded yet.</p>}
        {files.map((f) => (
          <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <FileText size={20} className="text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{f.file_name}</p>
              <p className="text-sm text-gray-500">{f.total_records} rows · {new Date(f.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
