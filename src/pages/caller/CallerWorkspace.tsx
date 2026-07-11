// Updated on 11 July
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Car, Calendar, Clock, CheckCircle, XCircle, PhoneOff,
  PhoneMissed, PhoneCall, ChevronDown, ChevronUp, Zap, Target,
  TrendingUp, Filter, Save, AlertTriangle, SkipForward, Inbox,
  MessageCircle, Gauge, Wrench, MapPin, Mail, Building2, FileSpreadsheet, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Lead, CallAction, LeadFile } from '../../types/database';

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Filters {
  serviceType: string;
  serviceDate: string; // exact date picker YYYY-MM-DD or ''
  fileId: string;      // selected lead_file id or ''
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function formatDisplayDate(dateStr: string | null) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatRelativeDate(dateStr: string | null): { label: string; urgency: 'red' | 'amber' | 'green' | 'muted' } {
  if (!dateStr) return { label: '—', urgency: 'muted' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr); date.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, urgency: 'red' };
  if (diff === 0) return { label: 'Due today', urgency: 'red' };
  if (diff === 1) return { label: 'Tomorrow', urgency: 'amber' };
  if (diff <= 7)  return { label: `In ${diff} days`, urgency: 'amber' };
  return { label: `In ${diff} days`, urgency: 'green' };
}

function svcBadgeStyle(type: string | null) {
  const t = type?.toUpperCase() ?? '';
  if (t === 'FREE 01') return { bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400', dot: 'bg-emerald-400', header: 'text-emerald-400' };
  if (t === 'FREE 02') return { bg: 'bg-blue-500/15 border-blue-500/30 text-blue-400', dot: 'bg-blue-400', header: 'text-blue-400' };
  if (t === 'FREE 03') return { bg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400', dot: 'bg-cyan-400', header: 'text-cyan-400' };
  if (t === 'PAID')    return { bg: 'bg-amber-500/15 border-amber-500/30 text-amber-400', dot: 'bg-amber-400', header: 'text-amber-400' };
  return { bg: 'bg-slate-500/15 border-slate-500/30 text-slate-400', dot: 'bg-slate-400', header: 'text-slate-400' };
}

const urgencyColor: Record<string, string> = {
  red:   'text-red-400',
  amber: 'text-amber-400',
  green: 'text-emerald-400',
  muted: 'text-slate-500',
};

const ACTION_OPTIONS: { value: CallAction; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'interested',     label: 'Interested',     icon: CheckCircle,  color: 'text-emerald-400' },
  { value: 'not_interested', label: 'Not Interested', icon: XCircle,      color: 'text-red-400' },
  { value: 'call_later',     label: 'Call Later',     icon: Clock,        color: 'text-amber-400' },
  { value: 'no_answer',      label: 'No Answer',      icon: PhoneMissed,  color: 'text-slate-400' },
  { value: 'busy',           label: 'Busy',           icon: PhoneOff,     color: 'text-orange-400' },
  { value: 'wrong_number',   label: 'Wrong Number',   icon: PhoneOff,     color: 'text-rose-400' },
  { value: 'completed',      label: 'Completed',      icon: CheckCircle,  color: 'text-cyan-400' },
];
const NOTES_REQUIRED: CallAction[] = ['interested', 'not_interested', 'wrong_number'];

function StatPill({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border border-white/[0.08] rounded-full">
      <Icon className={`w-3.5 h-3.5 ${accent}`} />
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-xs font-bold ${accent}`}>{value}</span>
    </div>
  );
}

const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function CallerWorkspace() {
  const { profile } = useAuth();

  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [totalPending, setTotalPending] = useState(0);
  const [callsToday, setCallsToday] = useState(0);
  const [interestedToday, setInterestedToday] = useState(0);
  const [selectedAction, setSelectedAction] = useState<CallAction | ''>('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [filters, setFilters] = useState<Filters>({ serviceType: 'ALL', serviceDate: '', fileId: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Lead files list (read-only)
  const [leadFiles, setLeadFiles] = useState<LeadFile[]>([]);

  // Lead locking refs
  const currentLeadRef = useRef<Lead | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Keep ref in sync for cleanup
  useEffect(() => { currentLeadRef.current = currentLead; }, [currentLead]);

  /* ─── Fetch lead files (read-only dropdown) ──────────────────────────── */
  const fetchLeadFiles = useCallback(async () => {
    if (!profile?.dealer_id) return;
    const { data } = await supabase
      .from('lead_files')
      .select('id, file_name, original_name, total_records, created_at')
      .eq('dealer_id', profile.dealer_id)
      .order('created_at', { ascending: false });
    if (data) setLeadFiles(data as LeadFile[]);
  }, [profile?.dealer_id]);

  useEffect(() => { fetchLeadFiles(); }, [fetchLeadFiles]);

  /* ─── Fetch today stats ──────────────────────────────────────────────── */
  const fetchTodayStats = useCallback(async () => {
    if (!profile?.id) return;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('call_logs').select('action')
      .eq('caller_id', profile.id)
      .gte('called_at', todayStart.toISOString());
    if (data) {
      setCallsToday(data.length);
      setInterestedToday(data.filter((l: { action: string }) => l.action === 'interested').length);
    }
  }, [profile?.id]);

  /* ─── Lock management ────────────────────────────────────────────────── */
  const startHeartbeat = useCallback((leadId: string) => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(async () => {
      if (!profile?.id) return;
      const { error } = await supabase
        .from('leads')
        .update({ locked_at: new Date().toISOString() })
        .eq('id', leadId)
        .eq('locked_by', profile.id);
      if (error) {
        // Lock might have been released by stale-locks sweeper; stop heartbeat
        if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [profile?.id]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }, []);

  const releaseLock = useCallback(async (leadId: string) => {
    if (!profile?.id) return;
    stopHeartbeat();
    await supabase.rpc('unlock_lead', { p_lead_id: leadId, p_caller_id: profile.id });
  }, [profile?.id, stopHeartbeat]);

  /* ─── Claim next lead (atomic via SECURITY DEFINER function) ─────────── */
  const fetchNextLead = useCallback(async () => {
    if (!profile?.dealer_id || !profile?.id) return;
    setLoading(true);
    try {
      // Release any previous lock before claiming a new one
      if (currentLeadRef.current) {
        await releaseLock(currentLeadRef.current.id);
      }

      // Convert date filter to YYYY-MM-DD for exact match
      const serviceDate = filters.serviceDate || null;

      const { data, error } = await supabase.rpc('claim_next_lead', {
        p_dealer_id: profile.dealer_id,
        p_caller_id: profile.id,
        p_service_type: filters.serviceType === 'ALL' ? null : filters.serviceType,
        p_file_id: filters.fileId || null,
        p_service_date: serviceDate,
      });

      if (error) throw error;

      const lead = data as unknown as Lead | null;
      setCurrentLead(lead ?? null);
      if (lead) {
        startHeartbeat(lead.id);
      } else {
        stopHeartbeat();
      }

      // Get pending count via RPC — checks both service_pending_date AND extra_data->>'Next Service Date'
      const { data: countResult, error: countErr } = await supabase.rpc('count_available_leads', {
        p_dealer_id: profile.dealer_id,
        p_service_type: filters.serviceType === 'ALL' ? null : filters.serviceType,
        p_file_id: filters.fileId || null,
        p_service_date: filters.serviceDate || null,
      });
      if (countErr) {
        setTotalPending(0);
      } else {
        setTotalPending((countResult as number) ?? 0);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load lead');
    } finally {
      setLoading(false);
    }
  }, [profile?.dealer_id, profile?.id, filters, releaseLock, startHeartbeat, stopHeartbeat]);

  useEffect(() => {
    fetchNextLead();
    fetchTodayStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  /* ─── Release lock on unmount / tab close ────────────────────────────── */
  useEffect(() => {
    const handleUnload = () => {
      // Synchronous best-effort release via sendBeacon
      const lead = currentLeadRef.current;
      if (!lead || !profile?.id) return;
      const body = JSON.stringify({ p_lead_id: lead.id, p_caller_id: profile.id });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/unlock_lead`;
      try {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } catch { /* best-effort */ }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      // Also release on component unmount (SPA navigation)
      if (currentLeadRef.current && profile?.id) {
        releaseLock(currentLeadRef.current.id);
      }
      stopHeartbeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  /* ─── Keyboard shortcut ──────────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedAction, notes, followUpDate, currentLead]); // eslint-disable-line

  /* ─── Save action ────────────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!currentLead || !selectedAction || !profile) return;
    if (selectedAction === 'call_later' && !followUpDate) { toast.error('Pick a follow-up date'); return; }
    if (NOTES_REQUIRED.includes(selectedAction) && !notes.trim()) {
      toast.error('Notes are required for this action');
      notesRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const { error: logErr } = await supabase.from('call_logs').insert({
        dealer_id: currentLead.dealer_id,
        lead_id: currentLead.id,
        caller_id: profile.id,
        action: selectedAction,
        excuse_notes: notes.trim() || null,
        follow_up_date: selectedAction === 'call_later' ? followUpDate : null,
      } as never);
      if (logErr) throw logErr;

      const newStatus =
        selectedAction === 'not_interested' ? 'not_interested' :
        selectedAction === 'call_later'     ? 'follow_up' :
        selectedAction === 'completed'      ? 'completed' : 'called';

      // Update status AND release the lock in one operation
      const { error: leadErr } = await supabase.from('leads')
        .update({ status: newStatus, locked_by: null, locked_at: null } as never)
        .eq('id', currentLead.id);
      if (leadErr) throw leadErr;

      stopHeartbeat();
      toast.success('Saved! Loading next…', { duration: 1500 });
      setSelectedAction(''); setNotes(''); setFollowUpDate('');
      await fetchTodayStats();
      await fetchNextLead();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  /* ─── Skip lead (release lock, get next) ─────────────────────────────── */
  const handleSkip = async () => {
    if (!currentLead) return;
    await releaseLock(currentLead.id);
    toast('Lead skipped — released to queue', { icon: '↩', duration: 1500 });
    await fetchNextLead();
  };

  /* ─── Derived values ─────────────────────────────────────────────────── */
  const extra = (currentLead?.extra_data ?? {}) as Record<string, string>;
  const badge = currentLead ? svcBadgeStyle(currentLead.service_type) : null;
  const svcDate = currentLead ? formatRelativeDate(currentLead.service_pending_date) : null;
  const insDate = currentLead ? formatRelativeDate(currentLead.insurance_expiry_date) : null;
  const selectedMeta = ACTION_OPTIONS.find(a => a.value === selectedAction);
  const todayStr = new Date().toISOString().split('T')[0];

  const lastSvcDate = extra['Last Service Date'] || null;
  const lastSvcKms  = extra['Last Service Kms'] || null;
  const lastSvcType = extra['Last Service Type'] || null;
  const vehicleType = extra['Vehicle Type'] || null;
  const sellerName  = extra['Selling Dealer Name'] || null;

  const knownExtraKeys = new Set(['Last Service Date', 'Last Service Kms', 'Last Service Type', 'Vehicle Type', 'Selling Dealer Name']);
  const otherExtras = Object.entries(extra).filter(([k]) => !knownExtraKeys.has(k) && k && extra[k]);

  const hasActiveFilters = filters.serviceType !== 'ALL' || filters.serviceDate !== '' || filters.fileId !== '';

  return (
    <div className="min-h-screen bg-[#080C14] p-6 lg:p-8">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-cyan-400" />
            Caller Workspace
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">One lead at a time · sequential queue</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatPill icon={PhoneCall} label="Calls today"  value={callsToday}       accent="text-cyan-400" />
          <StatPill icon={Target}    label="Interested"   value={interestedToday}   accent="text-emerald-400" />
          <StatPill icon={Inbox}     label="In queue"     value={totalPending}      accent="text-amber-400" />
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl mb-6 overflow-hidden">
        <button onClick={() => setFiltersOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-slate-300 hover:text-white transition-colors">
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-cyan-400" />
            Filters
            {hasActiveFilters && (
              <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-full font-bold">ACTIVE</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={(e) => { e.stopPropagation(); setFilters({ serviceType: 'ALL', serviceDate: '', fileId: '' }); }}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
            {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="px-5 pb-5 pt-1 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 gap-4">

                {/* Service type */}
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">Service Type</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(['ALL', 'FREE 01', 'FREE 02', 'FREE 03', 'PAID'] as const).map(t => {
                      const active = filters.serviceType === t;
                      const s = svcBadgeStyle(t === 'ALL' ? null : t);
                      return (
                        <button key={t} onClick={() => setFilters(f => ({ ...f, serviceType: t }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            active ? (t === 'ALL' ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : s.bg)
                            : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200'}`}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Next Service Date — exact match */}
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">
                    Next Service Date (exact)
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="date" value={filters.serviceDate}
                      onChange={e => setFilters(f => ({ ...f, serviceDate: e.target.value }))}
                      className="flex-1 bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                    {filters.serviceDate && (
                      <button onClick={() => setFilters(f => ({ ...f, serviceDate: '' }))}
                        className="shrink-0 w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">Shows only leads matching this exact date</p>
                </div>

                {/* Lead File dropdown */}
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3 h-3" /> Lead File
                  </label>
                  <select value={filters.fileId}
                    onChange={e => setFilters(f => ({ ...f, fileId: e.target.value }))}
                    className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    <option value="">All files</option>
                    {leadFiles.map(f => (
                      <option key={f.id} value={f.id}>{f.file_name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-600 mt-1">Filter by uploaded file</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
            <motion.div className="absolute inset-0 rounded-full border-2 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent"
              animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} />
          </div>
          <p className="text-sm text-slate-500">Loading lead…</p>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && !currentLead && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-emerald-400" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-white">
              {hasActiveFilters ? 'No leads match your filters' : 'Queue Complete!'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {hasActiveFilters
                ? 'Try clearing filters to see more leads.'
                : 'All leads have been worked through or are being handled by other callers.'}
            </p>
          </div>
          {hasActiveFilters && (
            <button onClick={() => setFilters({ serviceType: 'ALL', serviceDate: '', fileId: '' })}
              className="px-4 py-2 text-sm bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-xl hover:bg-cyan-500/20 transition-colors">
              Clear filters
            </button>
          )}
          <div className="flex gap-3 mt-2">
            <div className="text-center px-6 py-3 bg-slate-900/80 border border-white/[0.08] rounded-xl">
              <p className="text-2xl font-bold text-cyan-400">{callsToday}</p>
              <p className="text-xs text-slate-500 mt-0.5">Calls made</p>
            </div>
            <div className="text-center px-6 py-3 bg-slate-900/80 border border-white/[0.08] rounded-xl">
              <p className="text-2xl font-bold text-emerald-400">{interestedToday}</p>
              <p className="text-xs text-slate-500 mt-0.5">Interested</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Main workspace ────────────────────────────────────────────────── */}
      {!loading && currentLead && (
        <AnimatePresence mode="wait">
          <motion.div key={currentLead.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 max-w-5xl mx-auto"
          >
            {/* ── LEFT: Customer Card ─────────────────────────────────── */}
            <div className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl shadow-lg shadow-cyan-500/5 overflow-hidden">

              {/* Card top accent line */}
              <div className={`h-0.5 bg-gradient-to-r ${
                (currentLead.service_type?.toUpperCase() === 'PAID') ? 'from-amber-500/60 via-amber-400/40 to-transparent' :
                (currentLead.service_type?.startsWith('FREE')) ? 'from-emerald-500/60 via-emerald-400/40 to-transparent' :
                'from-cyan-500/60 via-cyan-400/40 to-transparent'
              }`} />

              {/* Header */}
              <div className="px-6 pt-5 pb-4">
                {currentLead.service_type && badge && (
                  <p className={`text-[10px] font-bold tracking-[0.12em] uppercase mb-2 ${badge.header}`}>
                    {currentLead.service_type} Customer
                  </p>
                )}
                <div className="flex items-start gap-3 justify-between">
                  <h2 className="text-2xl font-bold text-white leading-tight tracking-tight">
                    {currentLead.customer_name || 'Unknown Customer'}
                  </h2>
                  {badge && currentLead.service_type && (
                    <span className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${badge.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      {currentLead.service_type}
                    </span>
                  )}
                </div>
                {currentLead.phone && (
                  <a href={`tel:${currentLead.phone}`}
                    className="inline-flex items-center gap-1.5 mt-2 text-cyan-400 hover:text-cyan-300 font-mono text-base font-semibold transition-colors">
                    <Phone className="w-4 h-4" />
                    {currentLead.phone}
                  </a>
                )}
              </div>

              <div className="h-px bg-white/[0.06] mx-6" />

              {/* Vehicle & Service Details */}
              <div className="px-6 py-4 grid grid-cols-2 gap-4">

                {/* Vehicle Details */}
                <div className="bg-slate-800/40 rounded-xl p-3.5 col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Car className="w-3 h-3" /> Vehicle Details
                  </p>
                  <p className="text-sm font-bold text-white">
                    {currentLead.vehicle_model || '—'}
                    {vehicleType && <span className="text-slate-400 font-normal text-xs ml-1.5">({vehicleType})</span>}
                  </p>
                  {currentLead.vehicle_number && (
                    <p className="text-sm font-mono text-cyan-400 mt-0.5">{currentLead.vehicle_number}</p>
                  )}
                </div>

                {/* Last Service */}
                {(lastSvcDate || lastSvcKms || lastSvcType) && (
                  <div className="bg-slate-800/40 rounded-xl p-3.5 col-span-2 sm:col-span-1">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <Wrench className="w-3 h-3" /> Last Service
                    </p>
                    {lastSvcDate && <p className="text-sm font-bold text-white">{lastSvcDate}</p>}
                    {(lastSvcKms || lastSvcType) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {lastSvcKms && <span>{lastSvcKms} Kms</span>}
                        {lastSvcKms && lastSvcType && <span className="text-slate-600 mx-1.5">|</span>}
                        {lastSvcType && <span>{lastSvcType}</span>}
                      </p>
                    )}
                  </div>
                )}

                {/* Next Service Due */}
                {currentLead.service_pending_date && (
                  <div className={`col-span-2 rounded-xl p-3.5 border ${
                    svcDate?.urgency === 'red' ? 'bg-red-500/10 border-red-500/20' :
                    svcDate?.urgency === 'amber' ? 'bg-amber-500/10 border-amber-500/20' :
                    'bg-emerald-500/8 border-emerald-500/15'
                  }`}>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Due Next Service
                    </p>
                    <div className="flex items-center justify-between">
                      <p className={`text-xl font-bold ${
                        svcDate?.urgency === 'red' ? 'text-red-300' :
                        svcDate?.urgency === 'amber' ? 'text-amber-300' : 'text-emerald-300'
                      }`}>
                        {formatDisplayDate(currentLead.service_pending_date)}
                      </p>
                      {svcDate && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          svcDate.urgency === 'red' ? 'bg-red-500/15 border-red-500/30 text-red-300' :
                          svcDate.urgency === 'amber' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' :
                          'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        }`}>
                          {svcDate.label}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Insurance Expiry */}
                {currentLead.insurance_expiry_date && (
                  <div className={`col-span-2 rounded-xl p-3 border ${
                    insDate?.urgency === 'red' ? 'bg-red-500/8 border-red-500/15' : 'bg-slate-800/40 border-white/[0.06]'
                  }`}>
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" /> Insurance Expiry
                    </p>
                    <div className="flex items-center gap-3">
                      <p className={`text-sm font-bold ${urgencyColor[insDate?.urgency ?? 'muted']}`}>
                        {formatDisplayDate(currentLead.insurance_expiry_date)}
                      </p>
                      {insDate && <span className="text-xs text-slate-500">{insDate.label}</span>}
                    </div>
                  </div>
                )}

                {/* Address */}
                {currentLead.address && (
                  <div className="col-span-2 flex items-start gap-2.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Address</p>
                      <p className="text-sm text-slate-300 mt-0.5">{currentLead.address}</p>
                    </div>
                  </div>
                )}

                {/* Email */}
                {currentLead.email && (
                  <div className="col-span-2 flex items-start gap-2.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Email</p>
                      <a href={`mailto:${currentLead.email}`} className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors mt-0.5 block">
                        {currentLead.email}
                      </a>
                    </div>
                  </div>
                )}

                {/* Selling Dealer */}
                {sellerName && (
                  <div className="col-span-2 flex items-start gap-2.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Selling Dealer</p>
                      <p className="text-sm text-slate-300 mt-0.5">{sellerName}</p>
                    </div>
                  </div>
                )}

                {/* Other extra_data fields */}
                {otherExtras.map(([key, val]) => (
                  <div key={key} className="col-span-2 sm:col-span-1 flex items-start gap-2.5">
                    <Gauge className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{key}</p>
                      <p className="text-sm text-slate-300 mt-0.5">{val}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Call + WhatsApp buttons */}
              <div className="px-6 pb-5 flex gap-3">
                <a href={`tel:${currentLead.phone}`}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-semibold text-sm rounded-xl transition-all">
                  <Phone className="w-4 h-4" /> Call
                </a>
                {currentLead.phone && (
                  <a href={`https://wa.me/${currentLead.phone?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-800/60 hover:bg-slate-700/60 border border-white/[0.08] text-slate-300 hover:text-white font-semibold text-sm rounded-xl transition-all">
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                )}
              </div>
            </div>

            {/* ── RIGHT: Action Form ──────────────────────────────────── */}
            <div className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 pb-2 border-b border-white/[0.06]">
                <Zap className="w-4 h-4 text-cyan-400" />
                Log Call Status
              </h3>

              {/* Outcome */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">
                  Outcome <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <select value={selectedAction}
                    onChange={e => setSelectedAction(e.target.value as CallAction | '')}
                    className="w-full appearance-none bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 pr-10">
                    <option value="" disabled>Select outcome…</option>
                    {ACTION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
                {selectedMeta && (
                  <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium ${selectedMeta.color}`}>
                    <selectedMeta.icon className="w-3 h-3" />
                    {selectedMeta.label}
                  </div>
                )}
              </div>

              {/* Follow-up date */}
              {selectedAction === 'call_later' && (
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">
                    Follow-up Date <span className="text-red-400">*</span>
                  </label>
                  <input type="date" value={followUpDate} min={todayStr}
                    onChange={e => setFollowUpDate(e.target.value)}
                    className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
              )}

              {/* Notes */}
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">
                  Customer Remarks
                  {NOTES_REQUIRED.includes(selectedAction as CallAction) && <span className="text-red-400 ml-1">*</span>}
                </label>
                <textarea ref={notesRef} value={notes} onChange={e => setNotes(e.target.value)}
                  rows={5} placeholder="Enter details of conversation, objections, context…"
                  className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20" />
              </div>

              {/* Buttons */}
              <div className="space-y-2.5">
                <motion.button onClick={handleSave}
                  disabled={!selectedAction || saving}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-cyan-500/20 disabled:shadow-none disabled:cursor-not-allowed">
                  {saving ? (
                    <motion.div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />
                  ) : <Save className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Save & Load Next'}
                  {!saving && <TrendingUp className="w-3.5 h-3.5 opacity-70" />}
                </motion.button>

                <button onClick={handleSkip}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-slate-500 hover:text-slate-300 border border-white/[0.06] rounded-xl hover:bg-white/[0.03] transition-all">
                  <SkipForward className="w-3.5 h-3.5" />
                  Skip this lead
                </button>

                <p className="text-center text-[10px] text-slate-700">
                  Press <kbd className="px-1 py-0.5 bg-slate-800 border border-white/[0.08] rounded font-mono text-slate-500">S</kbd> to save
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
