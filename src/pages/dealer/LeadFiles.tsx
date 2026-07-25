import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { read, utils } from 'xlsx';
import {
  Upload, FileText, CheckCircle, XCircle, ChevronDown, RefreshCw, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  parseExcelDate, autoDetectMapping, computeNextServiceDate,
  ColumnMapping, EMPTY_MAPPING, FIELD_LABELS,
} from '../../lib/excelUtils';
import { useLeadFiles } from '../../hooks/useLeadFiles';

interface ParsedRow { [key: string]: unknown }
type Step = 'idle' | 'mapping' | 'uploading' | 'done';
interface State {
  step: Step;
  headers: string[];
  rows: ParsedRow[];
  mapping: ColumnMapping;
  fileName: string;
  progress: number;
  total: number;
  failed: number;
  error: string | null;
}

const INIT: State = { step: 'idle', headers: [], rows: [], mapping: EMPTY_MAPPING, fileName: '', progress: 0, total: 0, failed: 0, error: null };

export default function LeadFiles() {
  const { profile } = useAuth();
  const { files, refresh } = useLeadFiles();
  const [state, setState] = useState<State>(INIT);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = read(e.target!.result, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: ParsedRow[] = utils.sheet_to_json(ws, { defval: '', raw: true });
        if (!raw.length) { setState((s) => ({ ...s, step: 'idle', error: 'File is empty.' })); toast.error('File is empty'); return; }
        const headers = Object.keys(raw[0]);
        setState({ step: 'mapping', headers, rows: raw, mapping: autoDetectMapping(headers), fileName: file.name, progress: 0, total: raw.length, failed: 0, error: null });
      } catch {
        setState((s) => ({ ...s, step: 'idle', error: 'Failed to read file.' }));
        toast.error('Failed to read file');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  async function startUpload() {
    if (!profile?.dealer_id || !profile?.id) return;
    setState((s) => ({ ...s, step: 'uploading', progress: 0, failed: 0, error: null }));

    const { data: fileRecord, error: fileErr } = await supabase
      .from('lead_files')
      .insert({ dealer_id: profile.dealer_id, file_name: state.fileName, original_name: state.fileName, total_records: state.rows.length, uploaded_by: profile.id })
      .select()
      .single();

    if (fileErr || !fileRecord) {
      setState((s) => ({ ...s, step: 'done', error: 'Failed to create file record: ' + fileErr?.message }));
      toast.error('Failed to create file record');
      return;
    }

    const { mapping, rows } = state;
    const BATCH = 50;
    let uploaded = 0, failed = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const mappedCols = new Set(Object.values(mapping).filter(Boolean));

      const leadsToInsert = batch.map((row, idx) => {
        const extra: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          if (!mappedCols.has(k) && v !== '' && v !== null && v !== undefined) extra[k] = String(v);
        }
        const get = (col: string): string | null =>
          col && row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '' ? String(row[col]).trim() : null;

        const lastServiceDate = parseExcelDate(mapping.service_pending_date ? row[mapping.service_pending_date] : null);
        const nextServiceDate = parseExcelDate(mapping.next_service_date ? row[mapping.next_service_date] : null) ?? computeNextServiceDate(lastServiceDate);

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
        };
      });

      const { error: insertErr } = await supabase.from('leads').insert(leadsToInsert);
      if (insertErr) { console.error('Batch insert error:', insertErr); failed += batch.length; }
      else uploaded += batch.length;
      setState((s) => ({ ...s, progress: Math.min(i + BATCH, rows.length), failed }));
    }

    await supabase.from('lead_files').update({ total_records: uploaded }).eq('id', fileRecord.id);
    setState((s) => ({ ...s, step: 'done' }));
    refresh();
    toast.success(`${uploaded} leads uploaded${failed > 0 ? ` · ${failed} failed` : ''}`);
  }

  function reset() { setState(INIT); if (fileRef.current) fileRef.current.value = ''; }

  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-white">Lead Files</h1>
        <p className="text-slate-400 mt-1 text-sm">Upload Excel/CSV files to import leads</p>
      </motion.div>

      <div className="max-w-3xl mx-auto space-y-6">
        {state.step === 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-white/[0.1] rounded-2xl p-12 text-center hover:border-cyan-500/40 cursor-pointer transition-colors bg-slate-900/40"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mx-auto h-12 w-12 text-slate-500 mb-4" />
            <p className="text-slate-300 font-medium">Drop your Excel / CSV file here</p>
            <p className="text-slate-500 text-sm mt-1">or click to browse</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {state.error && <p className="text-red-400 text-sm mt-3">{state.error}</p>}
          </motion.div>
        )}

        {state.step === 'mapping' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl overflow-hidden"
          >
            <div className="p-5 border-b border-white/[0.06] flex items-center gap-3">
              <FileText className="text-cyan-400" size={20} />
              <div>
                <p className="font-semibold text-white">{state.fileName}</p>
                <p className="text-sm text-slate-500">{state.rows.length} rows · {state.headers.length} columns</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm font-medium text-slate-300 mb-4">Column Mapping — auto-detected. Adjust if needed.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(FIELD_LABELS) as Array<keyof ColumnMapping>).map((field) => (
                  <div key={field} className="flex items-center gap-3">
                    <label className="text-sm text-slate-400 w-44 shrink-0">{FIELD_LABELS[field]}</label>
                    <div className="relative flex-1">
                      <select
                        value={state.mapping[field]}
                        onChange={(e) => setState((s) => ({ ...s, mapping: { ...s.mapping, [field]: e.target.value } }))}
                        className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-3 py-1.5 pr-8 text-sm text-white appearance-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                      >
                        <option value="">— not mapped —</option>
                        {state.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-cyan-500/[0.08] border border-cyan-500/20 rounded-xl text-xs text-cyan-300">
                If "Next Service Date" is not in your file, it is auto-calculated as Last Service Date + 3 months.
              </div>
            </div>
            <div className="p-5 border-t border-white/[0.06] flex gap-3 justify-end">
              <button onClick={reset} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all">Cancel</button>
              <button onClick={startUpload} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-cyan-500/20 transition-all">Upload {state.rows.length} Leads</button>
            </div>
          </motion.div>
        )}

        {state.step === 'uploading' && (
          <div className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-8 text-center">
            <div className="w-10 h-10 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="font-medium text-white">Uploading leads...</p>
            <p className="text-slate-500 text-sm mt-1">{state.progress} / {state.total} rows</p>
            <div className="mt-4 bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-cyan-500 to-blue-600 h-2 transition-all" style={{ width: `${state.total > 0 ? (state.progress / state.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        <AnimatePresence>
          {state.step === 'done' && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-8 text-center"
            >
              {state.failed === state.total && state.total > 0 ? (
                <><XCircle className="mx-auto h-12 w-12 text-red-400 mb-3" /><p className="font-semibold text-lg text-white">Upload Failed</p></>
              ) : (
                <><CheckCircle className="mx-auto h-12 w-12 text-green-400 mb-3" /><p className="font-semibold text-lg text-white">Upload Complete</p><p className="text-slate-500 text-sm mt-1">{state.total - state.failed} leads uploaded{state.failed > 0 && ` · ${state.failed} failed`}</p></>
              )}
              {state.error && <p className="mt-3 text-sm text-red-400">{state.error}</p>}
              <button onClick={reset} className="mt-6 px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-cyan-500/20 transition-all">Upload Another File</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Uploaded files list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Uploaded Files</h2>
            <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {files.length === 0 && <p className="text-slate-500 text-sm">No files uploaded yet.</p>}
          {files.map((f) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center shrink-0">
                <FileText size={18} className="text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{f.file_name}</p>
                <p className="text-sm text-slate-500">{f.total_records} rows · {new Date(f.created_at).toLocaleDateString()}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
