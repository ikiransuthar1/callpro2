import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, Trash2, X, FileSpreadsheet,
  CheckCircle, AlertCircle, RefreshCw, Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { LeadFile } from '../../types/database';
import toast from 'react-hot-toast';

/* ─── Field definitions ─────────────────────────────────────────────────── */
const DB_FIELDS = [
  { key: 'customer_name',         label: 'Customer Name' },
  { key: 'phone',                 label: 'Mobile / Phone' },
  { key: 'vehicle_number',        label: 'Registration No.' },
  { key: 'vehicle_model',         label: 'Model Name' },
  { key: 'next_service_type',     label: 'Next Service Type (FREE 01 / FREE 02 / PAID)' },
  { key: 'next_service_date',     label: 'Next Service Date' },
  { key: 'insurance_expiry_date', label: 'Insurance Expiry Date' },
  { key: 'address',               label: 'Address' },
  { key: 'email',                 label: 'Email' },
] as const;

type DbFieldKey = (typeof DB_FIELDS)[number]['key'];
type ColumnMapping = Partial<Record<DbFieldKey, string>>;

/* ─── Auto-detect Honda service CSV columns ────────────────────────────── */
const AUTO_DETECT_RULES: Array<{ field: DbFieldKey; keywords: string[] }> = [
  { field: 'customer_name',         keywords: ['customer name', 'customername', 'name'] },
  { field: 'phone',                 keywords: ['mobile number', 'mobilenumber', 'mobile', 'phone', 'contact'] },
  { field: 'vehicle_number',        keywords: ['registration no', 'registration no.', 'reg no', 'regno', 'vehicle number', 'vehiclenumber', 'reg.'] },
  { field: 'vehicle_model',         keywords: ['model name', 'modelname', 'model', 'vehicle model'] },
  { field: 'next_service_type',     keywords: ['next service type', 'nextservicetype', 'service type'] },
  { field: 'next_service_date',     keywords: ['next service date', 'nextservicedate', 'service date', 'service pending'] },
  { field: 'insurance_expiry_date', keywords: ['insurance expiry', 'insuranceexpiry', 'expiry date', 'insurance date'] },
  { field: 'address',               keywords: ['address', 'city', 'location'] },
  { field: 'email',                 keywords: ['email', 'e-mail', 'mail'] },
];

function autoDetectMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const rule of AUTO_DETECT_RULES) {
    for (const col of columns) {
      const normalized = col.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (rule.keywords.some(k => normalized === k || normalized.includes(k))) {
        mapping[rule.field] = col;
        break;
      }
    }
  }
  return mapping;
}

/* ─── Date parsing: any Excel/CSV date → YYYY-MM-DD ───────────────────── */
// With cellDates:true, XLSX returns JS Date objects for date cells.
// With cellDates:false (legacy), dates may be strings in various formats.
function parseDate(raw: string | Date | null | undefined): string | null {
  if (!raw) return null;

  // JS Date object (from XLSX with cellDates: true)
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Already YYYY-MM-DD or ISO datetime
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  // DD/MM/YYYY — the Honda CSV/XLSX format (day-first)
  const ddmm = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) {
    const day = ddmm[1].padStart(2, '0');
    const mon = ddmm[2].padStart(2, '0');
    return `${ddmm[3]}-${mon}-${day}`;
  }

  // Excel serial number (days since 1899-12-30)
  if (/^\d{4,6}(\.\d+)?$/.test(str)) {
    const serial = Math.floor(parseFloat(str));
    if (serial > 1 && serial < 100000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const date  = new Date(epoch.getTime() + serial * 86400000);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // Fallback: try XLSX serial parser
    const d = XLSX.SSF.parse_date_code(Number(str));
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }

  return null;
}

interface ParsedData {
  columns: string[];
  rows: Record<string, string | Date>[];
  fileName: string;
}

interface UploadStats { parsed: number; inserted: number; errors: number; }

export default function LeadFiles() {
  const { profile } = useAuth();
  const dealerId = profile?.dealer_id;

  const [files, setFiles] = useState<LeadFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [dragging, setDragging] = useState(false);

  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [showMapping, setShowMapping] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<UploadStats | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<LeadFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ─── Fetch file list ───────────────────────────────────────────────── */
  const fetchFiles = useCallback(async () => {
    if (!dealerId) return;
    setLoadingFiles(true);
    const { data, error } = await supabase
      .from('lead_files')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load files: ' + error.message);
    else setFiles((data ?? []) as LeadFile[]);
    setLoadingFiles(false);
  }, [dealerId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  /* ─── Parse file (XLSX handles UTF-16 CSV + Excel) ─────────────────── */
  function parseFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'xlsx', 'xls', 'txt'].includes(ext)) {
      toast.error('Only CSV or Excel (.xlsx/.xls) files are supported');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const data = new Uint8Array(buffer);
        // XLSX.read handles UTF-16 BOM, tab-separated, and Excel formats
        // cellDates: true → Excel date cells become JS Date objects (most reliable)
        // raw: false      → non-date cells formatted as strings
        const workbook = XLSX.read(data, { type: 'array', raw: false, cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, string | Date>>(sheet, {
          raw: false,
          defval: '',
        });
        if (jsonRows.length === 0) { toast.error('File is empty'); return; }
        const columns = Object.keys(jsonRows[0]);
        const rows = jsonRows as Record<string, string | Date>[];
        const detected = autoDetectMapping(columns);
        setParsedData({ columns, rows, fileName: file.name });
        setMapping(detected);
        setShowMapping(true);
        setStats(null);
      } catch (err) {
        toast.error('Failed to parse file: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /* ─── Drag & drop ───────────────────────────────────────────────────── */
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  /* ─── Confirm upload ────────────────────────────────────────────────── */
  async function handleConfirmUpload() {
    if (!parsedData || !dealerId || !profile) return;
    if (!mapping.phone && !mapping.customer_name) {
      toast.error('Map at least "Mobile / Phone" or "Customer Name"');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Step 1: create lead_file record (without .select() to avoid dual-RLS check)
      const { error: fileErr } = await supabase
        .from('lead_files')
        .insert({
          dealer_id: dealerId,
          file_name: parsedData.fileName.replace(/\.[^.]+$/, ''),
          original_name: parsedData.fileName,
          total_records: parsedData.rows.length,
          uploaded_by: profile.id,
        });

      if (fileErr) throw new Error('File record failed: ' + fileErr.message);

      // Step 2: get the file id we just created
      const { data: fileRecord, error: fetchErr } = await supabase
        .from('lead_files')
        .select('id')
        .eq('dealer_id', dealerId)
        .eq('original_name', parsedData.fileName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchErr || !fileRecord) throw new Error('Could not retrieve file record');
      const fileId = fileRecord.id;

      // Step 3: batch insert leads
      const rows = parsedData.rows;
      const chunkSize = 50;
      let inserted = 0;
      let errors = 0;

      // Collect all columns NOT mapped to db fields so we can store them in extra_data
      const mappedCols = new Set(Object.values(mapping).filter(Boolean));

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const leadsChunk = chunk.map((row, idx) => {
          // Build extra_data from unmapped columns
          const extra: Record<string, string> = {};
          for (const col of parsedData.columns) {
            if (!mappedCols.has(col) && row[col]) extra[col] = row[col];
          }
          return {
            dealer_id: dealerId,
            file_id: fileId,
            customer_name:        mapping.customer_name        ? (String(row[mapping.customer_name] ?? '') || null) : null,
            phone:                mapping.phone                ? (String(row[mapping.phone] ?? '') || null) : null,
            vehicle_number:       mapping.vehicle_number       ? (String(row[mapping.vehicle_number] ?? '') || null) : null,
            vehicle_model:         mapping.vehicle_model         ? (String(row[mapping.vehicle_model] ?? '') || null) : null,
            // next_service_type is the canonical column; also mirror to legacy service_type
            next_service_type:     mapping.next_service_type     ? (String(row[mapping.next_service_type] ?? '') || null) : null,
            service_type:          mapping.next_service_type     ? (String(row[mapping.next_service_type] ?? '') || null) : null,
            // next_service_date is the canonical column; also mirror to legacy service_pending_date
            next_service_date:     parseDate(mapping.next_service_date     ? row[mapping.next_service_date]     : null),
            service_pending_date:  parseDate(mapping.next_service_date     ? row[mapping.next_service_date]     : null),
            insurance_expiry_date: parseDate(mapping.insurance_expiry_date ? row[mapping.insurance_expiry_date] : null),
            address:              mapping.address              ? (row[mapping.address] || null) : null,
            email:                mapping.email                ? (row[mapping.email] || null) : null,
            extra_data:           Object.keys(extra).length > 0 ? extra : null,
            status:               'pending' as const,
            sort_order:           i + idx,
          };
        });

        const { error: insertErr, count } = await supabase
          .from('leads')
          .insert(leadsChunk)
          .select('id', { count: 'exact', head: true });

        if (insertErr) {
          console.error('Chunk insert error:', insertErr.message);
          errors += chunk.length;
        } else {
          inserted += count ?? chunk.length;
        }
        setProgress(Math.round(((i + chunk.length) / rows.length) * 100));
      }

      setStats({ parsed: rows.length, inserted, errors });
      if (errors === 0) {
        toast.success(`${inserted} leads uploaded successfully`);
      } else {
        toast.error(`${errors} rows failed, ${inserted} succeeded`);
      }
      setShowMapping(false);
      setParsedData(null);
      await fetchFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  /* ─── Delete file ───────────────────────────────────────────────────── */
  async function handleDeleteFile() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase
      .from('lead_files')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      toast.error('Delete failed: ' + error.message);
    } else {
      toast.success(`"${deleteTarget.original_name}" deleted`);
      setFiles(prev => prev.filter(f => f.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
    setDeleting(false);
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="p-8 min-h-full">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Lead Files</h1>
            <p className="text-slate-400 text-sm mt-1">Upload customer calling data via Excel or CSV</p>
          </div>
          <button
            onClick={fetchFiles}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl border border-white/[0.06] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Upload stats banner */}
        <AnimatePresence>
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`flex items-start gap-3 p-4 rounded-2xl border ${
                stats.errors === 0
                  ? 'bg-emerald-500/10 border-emerald-500/20'
                  : 'bg-amber-500/10 border-amber-500/20'
              }`}
            >
              {stats.errors === 0 ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${stats.errors === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  Upload Complete
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {stats.parsed} rows parsed · {stats.inserted} inserted · {stats.errors} errors
                </p>
              </div>
              <button onClick={() => setStats(null)}><X className="w-4 h-4 text-slate-500" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drop zone */}
        <motion.div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          animate={{ borderColor: dragging ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.08)' }}
          className="relative bg-slate-900/60 border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer hover:bg-slate-800/40 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { parseFile(f); e.target.value = ''; }}}
          />
          <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 transition-colors ${
            dragging ? 'bg-cyan-500/20' : 'bg-slate-800'
          }`}>
            <UploadCloud className={`w-6 h-6 ${dragging ? 'text-cyan-400' : 'text-slate-400'}`} />
          </div>
          <p className="text-white font-medium">Drop your Excel or CSV file here</p>
          <p className="text-slate-500 text-sm mt-1">or click to browse · .xlsx .xls .csv</p>
          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 rounded-full text-xs text-slate-500">
            <Info className="w-3 h-3" />
            UTF-16 Honda service CSV files are supported
          </div>
        </motion.div>

        {/* Uploaded files */}
        <div className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white">Uploaded Files</h2>
          </div>
          {loadingFiles ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileSpreadsheet className="w-10 h-10 text-slate-700" />
              <p className="text-slate-500 text-sm">No files uploaded yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {files.map(file => (
                <div key={file.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{file.original_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {file.total_records.toLocaleString()} records · {new Date(file.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                    Active
                  </span>
                  <button
                    onClick={() => setDeleteTarget(file)}
                    className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Column Mapping Modal */}
      <AnimatePresence>
        {showMapping && parsedData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) { setShowMapping(false); setParsedData(null); }}}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                <div>
                  <h3 className="text-base font-semibold text-white">Map Columns</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {parsedData.fileName} · {parsedData.rows.length} rows · {parsedData.columns.length} columns detected
                  </p>
                </div>
                <button onClick={() => { setShowMapping(false); setParsedData(null); }}
                  className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Detected columns preview */}
              <div className="px-6 py-3 border-b border-white/[0.06] bg-slate-800/30">
                <p className="text-xs text-slate-400 mb-2 font-medium">DETECTED COLUMNS IN FILE</p>
                <div className="flex flex-wrap gap-1.5">
                  {parsedData.columns.map(col => (
                    <span key={col} className="text-xs px-2 py-0.5 bg-slate-700/60 text-slate-300 rounded-md">
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {/* Mapping rows */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {DB_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-52 shrink-0">
                      <p className="text-xs font-medium text-slate-300">{label}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5 font-mono">{key}</p>
                    </div>
                    <select
                      value={mapping[key] ?? ''}
                      onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value || undefined }))}
                      className="flex-1 bg-slate-800/60 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none"
                    >
                      <option value="">— Not mapped —</option>
                      {parsedData.columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <div className="w-5 shrink-0">
                      {mapping[key] ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-700" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Sample row preview */}
              {parsedData.rows.length > 0 && mapping.customer_name && (
                <div className="px-6 py-3 border-t border-white/[0.06] bg-slate-800/20">
                  <p className="text-xs text-slate-500 mb-1 font-medium">SAMPLE ROW PREVIEW</p>
                  <p className="text-xs text-slate-300 truncate">
                    <span className="text-slate-500">Name:</span> {parsedData.rows[0][mapping.customer_name ?? ''] || '—'} &nbsp;
                    <span className="text-slate-500">Phone:</span> {parsedData.rows[0][mapping.phone ?? ''] || '—'} &nbsp;
                    <span className="text-slate-500">Service:</span> {parsedData.rows[0][mapping.service_type ?? ''] || '—'} &nbsp;
                    <span className="text-slate-500">Date:</span> {parsedData.rows[0][mapping.service_pending_date ?? ''] || '—'}
                  </p>
                </div>
              )}

              {/* Progress bar */}
              <AnimatePresence>
                {uploading && (
                  <div className="px-6 py-2 border-t border-white/[0.06]">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Uploading…</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full"
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  </div>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
                <p className="text-xs text-slate-500">
                  {Object.values(mapping).filter(Boolean).length}/{DB_FIELDS.length} fields mapped
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowMapping(false); setParsedData(null); }}
                    disabled={uploading}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-white/[0.08] rounded-xl transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmUpload}
                    disabled={uploading || (!mapping.phone && !mapping.customer_name)}
                    className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {uploading ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading…</>
                    ) : (
                      `Upload ${parsedData.rows.length} Records`
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm"
            >
              <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-4">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">Delete File?</h3>
              <p className="text-sm text-slate-400 mb-1">
                <span className="text-white font-medium">"{deleteTarget.original_name}"</span> and all{' '}
                <span className="text-red-400 font-medium">{deleteTarget.total_records} leads</span> will be permanently deleted.
              </p>
              <p className="text-xs text-slate-500 mb-6">This action cannot be undone. Callers will lose access immediately.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 text-sm text-slate-400 border border-white/[0.08] rounded-xl hover:bg-white/[0.03] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteFile}
                  disabled={deleting}
                  className="flex-1 py-2.5 text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
