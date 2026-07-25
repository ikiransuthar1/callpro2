import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { read, utils } from 'xlsx';
import {
  Upload, FileText, CheckCircle, XCircle, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { autoDetectMapping, buildLeadFromRow } from '../../lib/excelUtils';
import { useLeadFiles } from '../../hooks/useLeadFiles';

interface ParsedRow { [key: string]: unknown }
type Step = 'idle' | 'uploading' | 'done';
interface State {
  step: Step;
  fileName: string;
  progress: number;
  total: number;
  succeeded: number;
  failed: number;
  error: string | null;
}

const INIT: State = { step: 'idle', fileName: '', progress: 0, total: 0, succeeded: 0, failed: 0, error: null };

export default function LeadFiles() {
  const { profile } = useAuth();
  const { files, refresh } = useLeadFiles();
  const [state, setState] = useState<State>(INIT);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!profile?.dealer_id || !profile?.id) {
      toast.error('Your account is not linked to a dealership.');
      return;
    }

    const rows = await new Promise<ParsedRow[]>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = read(e.target!.result, { type: 'array', cellDates: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw: ParsedRow[] = utils.sheet_to_json(ws, { defval: '', raw: true });
          resolve(raw);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsArrayBuffer(file);
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to read file.';
      setState((s) => ({ ...s, step: 'idle', error: msg }));
      toast.error(msg);
      return null;
    });

    if (!rows || rows.length === 0) {
      const msg = rows && rows.length === 0 ? 'File is empty.' : 'Failed to read file.';
      setState((s) => ({ ...s, step: 'idle', error: msg }));
      toast.error(msg);
      return;
    }

    const headers = Object.keys(rows[0]);
    const mapping = autoDetectMapping(headers);

    setState({
      step: 'uploading',
      fileName: file.name,
      progress: 0,
      total: rows.length,
      succeeded: 0,
      failed: 0,
      error: null,
    });

    const { data: fileRecord, error: fileErr } = await supabase
      .from('lead_files')
      .insert({
        dealer_id: profile.dealer_id,
        file_name: file.name,
        original_name: file.name,
        total_records: rows.length,
        uploaded_by: profile.id,
      })
      .select()
      .single();

    if (fileErr || !fileRecord) {
      setState((s) => ({ ...s, step: 'done', error: 'Failed to create file record: ' + fileErr?.message }));
      toast.error('Failed to create file record');
      return;
    }

    const BATCH = 50;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);

      const leadsToInsert = batch.map((row, idx) => {
        const fields = buildLeadFromRow(row, mapping);
        return {
          dealer_id: profile.dealer_id!,
          file_id: fileRecord.id,
          ...fields,
          status: 'pending' as const,
          sort_order: i + idx,
        };
      });

      const { error: insertErr } = await supabase.from('leads').insert(leadsToInsert);
      if (insertErr) {
        console.error('Batch insert error:', insertErr);
        failed += batch.length;
      } else {
        succeeded += batch.length;
      }
      setState((s) => ({
        ...s,
        progress: Math.min(i + BATCH, rows.length),
        succeeded,
        failed,
      }));
    }

    await supabase.from('lead_files').update({ total_records: succeeded }).eq('id', fileRecord.id);
    setState((s) => ({ ...s, step: 'done' }));
    refresh();
    toast.success(`${succeeded} leads uploaded${failed > 0 ? ` · ${failed} failed` : ''}`);
  }, [profile?.dealer_id, profile?.id]);

  function reset() {
    setState(INIT);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-white">Lead Files</h1>
        <p className="text-slate-400 mt-1 text-sm">Upload Excel/CSV files — columns are detected automatically</p>
      </motion.div>

      <div className="max-w-3xl mx-auto space-y-6">
        {state.step === 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-white/[0.1] rounded-2xl p-12 text-center hover:border-cyan-500/40 cursor-pointer transition-colors bg-slate-900/40"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mx-auto h-12 w-12 text-slate-500 mb-4" />
            <p className="text-slate-300 font-medium">Drop your Excel / CSV file here</p>
            <p className="text-slate-500 text-sm mt-1">or click to browse — upload is automatic</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <p className="text-slate-600 text-xs mt-4 max-w-sm mx-auto">
              Standard columns (Name, Phone, Vehicle, Dates) are mapped automatically.
              All other columns are stored and shown to callers as-is.
            </p>
            {state.error && <p className="text-red-400 text-sm mt-3">{state.error}</p>}
          </motion.div>
        )}

        {state.step === 'uploading' && (
          <div className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-8 text-center">
            <div className="w-10 h-10 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
            <p className="font-medium text-white">Uploading leads...</p>
            <p className="text-slate-500 text-sm mt-1">
              {state.progress} / {state.total} rows
              {state.failed > 0 && ` · ${state.failed} failed`}
            </p>
            <div className="mt-4 bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-600 h-2 transition-all"
                style={{ width: `${state.total > 0 ? (state.progress / state.total) * 100 : 0}%` }}
              />
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
                <>
                  <XCircle className="mx-auto h-12 w-12 text-red-400 mb-3" />
                  <p className="font-semibold text-lg text-white">Upload Failed</p>
                </>
              ) : (
                <>
                  <CheckCircle className="mx-auto h-12 w-12 text-green-400 mb-3" />
                  <p className="font-semibold text-lg text-white">Upload Complete</p>
                  <p className="text-slate-500 text-sm mt-1">
                    {state.succeeded} leads uploaded
                    {state.failed > 0 && ` · ${state.failed} failed`}
                  </p>
                </>
              )}
              {state.error && <p className="mt-3 text-sm text-red-400">{state.error}</p>}
              <button
                onClick={reset}
                className="mt-6 px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
              >
                Upload Another File
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Uploaded files list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Uploaded Files</h2>
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
            >
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
                <p className="text-sm text-slate-500">
                  {f.total_records} rows · {new Date(f.created_at).toLocaleDateString()}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
