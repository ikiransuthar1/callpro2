import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Phone, PhoneCall, Calendar, Save, Filter, X, PhoneOff, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Lead, CallAction, LeadStatus } from '../../types/database';
import { getNextServiceDate, getNextServiceType } from '../../types/database';

const OUTCOMES: { label: string; action: CallAction; status: LeadStatus }[] = [
  { label: 'Answered - Interested', action: 'interested', status: 'completed' },
  { label: 'Answered - Not Interested', action: 'not_interested', status: 'not_interested' },
  { label: 'No Answer', action: 'no_answer', status: 'called' },
  { label: 'Busy', action: 'busy', status: 'called' },
  { label: 'Callback Scheduled', action: 'call_later', status: 'follow_up' },
  { label: 'Wrong Number', action: 'wrong_number', status: 'completed' },
  { label: 'Completed', action: 'completed', status: 'completed' },
];

function fmtDate(d: string | null) {
  if (!d) return null;
  // Dates are stored as YYYY-MM-DD (date column, no timezone). Parse as local.
  try {
    const [y, m, day] = d.split('-');
    return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return d;
  }
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  // Per requirement #2: show everything, including blanks, so callers see the full row.
  const display = value === null || value === undefined ? '' : String(value).trim();
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-200 mt-0.5 break-words">
        {display !== '' ? display : <span className="text-slate-600">—</span>}
      </p>
    </div>
  );
}

type WorkspaceState = 'loading' | 'has_lead' | 'no_leads_for_filter' | 'all_done';

interface FilterOptions {
  dates: string[];
  serviceTypes: string[];
}

export default function CallerWorkspace() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [filterDate, setFilterDate] = useState('');
  const [filterServiceType, setFilterServiceType] = useState('');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const [wsState, setWsState] = useState<WorkspaceState>('loading');
  const [lead, setLead] = useState<Lead | null>(null);
  const [remainingCount, setRemainingCount] = useState(0);

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ dates: [], serviceTypes: [] });

  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [callback, setCallback] = useState('');
  const [saving, setSaving] = useState(false);

  const lockedLeadId = useRef<string | null>(null);

  // Fetch pending leads to derive distinct next_service_date / next_service_type
  // filter options from extra_data (jsonb), since the dedicated columns are
  // not reliably exposed by PostgREST's schema cache.
  const loadFilterOptions = useCallback(async () => {
    if (!profile?.dealer_id) return;
    const { data } = await supabase
      .from('leads')
      .select('extra_data')
      .eq('dealer_id', profile.dealer_id)
      .eq('status', 'pending')
      .is('locked_by', null);

    const dateSet = new Set<string>();
    const typeSet = new Set<string>();
    for (const r of (data ?? []) as Pick<Lead, 'extra_data'>[]) {
      const d = getNextServiceDate(r);
      if (d) dateSet.add(d);
      const t = getNextServiceType(r);
      if (t) typeSet.add(t);
    }
    setFilterOptions({ dates: Array.from(dateSet).sort(), serviceTypes: Array.from(typeSet).sort() });
  }, [profile?.dealer_id]);

  const fetchNextLead = useCallback(async (releasedId?: string) => {
    if (!profile?.dealer_id || !profile?.id) return;

    setWsState('loading');
    setSelectedOutcome('');
    setNotes('');
    setCallback('');

    if (releasedId) {
      await supabase
        .from('leads')
        .update({ locked_by: null, locked_at: null })
        .eq('id', releasedId)
        .eq('locked_by', profile.id);
      lockedLeadId.current = null;
    }

    let query = supabase
      .from('leads')
      .select('*')
      .eq('dealer_id', profile.dealer_id)
      .eq('status', 'pending')
      .is('locked_by', null);

    // No server-side jsonb-equality filters: fetch the next unlocked pending
    // lead and apply next_service_date / next_service_type filters client-side.
    const fetchBatch = async (): Promise<{ candidate: Lead | null; remaining: number }> => {
      let candidate: Lead | null = null;
      let remaining = 0;
      // Page through pending leads until one matches the active filters.
      let page = 0;
      const PAGE = 100;
      while (true) {
        const { data } = await query
          .order('sort_order', { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        const rows = (data ?? []) as Lead[];
        if (rows.length === 0) break;
        for (const row of rows) {
          if (filterDate && getNextServiceDate(row) !== filterDate) continue;
          if (filterServiceType && getNextServiceType(row) !== filterServiceType) continue;
          if (!candidate) candidate = row;
          remaining++;
        }
        if (candidate || rows.length < PAGE) break;
        page++;
      }
      return { candidate, remaining };
    };

    const { candidate, remaining } = await fetchBatch();

    if (candidate) {
      await supabase
        .from('leads')
        .update({ locked_by: profile.id, locked_at: new Date().toISOString() })
        .eq('id', candidate.id);

      lockedLeadId.current = candidate.id;
      setLead(candidate);
      setRemainingCount(remaining);
      setWsState('has_lead');
    } else {
      setLead(null);
      lockedLeadId.current = null;
      setRemainingCount(0);
      setWsState(filterDate || filterServiceType ? 'no_leads_for_filter' : 'all_done');
    }
  }, [profile?.dealer_id, profile?.id, filterDate, filterServiceType]);

  useEffect(() => { loadFilterOptions(); }, [loadFilterOptions]);
  useEffect(() => { fetchNextLead(); }, [fetchNextLead]);

  // Release the current lead's lock when the caller unmounts.
  useEffect(() => {
    return () => {
      if (lockedLeadId.current && profile?.id) {
        supabase
          .from('leads')
          .update({ locked_by: null, locked_at: null })
          .eq('id', lockedLeadId.current)
          .eq('locked_by', profile.id);
      }
    };
  }, [profile?.id]);

  async function submitCall() {
    if (!lead || !selectedOutcome || !profile?.id || !profile?.dealer_id) return;
    const match = OUTCOMES.find((o) => o.label === selectedOutcome);
    if (!match) return;

    setSaving(true);
    try {
      const { error: logErr } = await supabase.from('call_logs').insert({
        lead_id: lead.id,
        caller_id: profile.id,
        dealer_id: profile.dealer_id,
        action: match.action,
        excuse_notes: notes || null,
        follow_up_date: callback ? callback.split('T')[0] : null,
      });
      if (logErr) throw logErr;

      const { error: leadErr } = await supabase
        .from('leads')
        .update({ status: match.status, locked_by: null, locked_at: null })
        .eq('id', lead.id);
      if (leadErr) throw leadErr;

      lockedLeadId.current = null;
      toast.success('Call logged');
      loadFilterOptions();
      fetchNextLead(lead.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save call');
      setSaving(false);
    }
  }

  function skipLead() {
    if (!lead) return;
    fetchNextLead(lead.id);
  }

  function clearFilters() {
    setFilterDate('');
    setFilterServiceType('');
    setShowDateDropdown(false);
    setShowServiceDropdown(false);
  }

  const hasActiveFilter = filterDate || filterServiceType;

  const filterBar = (
    <div className="bg-slate-900/80 backdrop-blur border-b border-white/[0.06] px-5 py-2.5 flex items-center gap-2 flex-wrap sticky top-0 z-10">
      {/* Date filter dropdown */}
      <div className="relative">
        <button
          onClick={() => { setShowDateDropdown((s) => !s); setShowServiceDropdown(false); }}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            filterDate
              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-medium'
              : 'border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
          }`}
        >
          <Filter size={14} />
          {filterDate ? `Date: ${fmtDate(filterDate)}` : 'Next Service Date'}
          <ChevronDown size={12} />
        </button>
        {showDateDropdown && (
          <div className="absolute top-full left-0 mt-1 w-56 max-h-72 overflow-y-auto bg-slate-800 border border-white/[0.08] rounded-xl shadow-2xl z-20 py-1">
            <button
              onClick={() => { setFilterDate(''); setShowDateDropdown(false); }}
              className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              All Dates
            </button>
            {filterOptions.dates.map((d) => (
              <button
                key={d}
                onClick={() => { setFilterDate(d); setShowDateDropdown(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  filterDate === d ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {fmtDate(d)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Service type filter dropdown */}
      <div className="relative">
        <button
          onClick={() => { setShowServiceDropdown((s) => !s); setShowDateDropdown(false); }}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            filterServiceType
              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-medium'
              : 'border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
          }`}
        >
          <Filter size={14} />
          {filterServiceType ? `Type: ${filterServiceType}` : 'Service Type'}
          <ChevronDown size={12} />
        </button>
        {showServiceDropdown && (
          <div className="absolute top-full left-0 mt-1 w-56 max-h-72 overflow-y-auto bg-slate-800 border border-white/[0.08] rounded-xl shadow-2xl z-20 py-1">
            <button
              onClick={() => { setFilterServiceType(''); setShowServiceDropdown(false); }}
              className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              All Service Types
            </button>
            {filterOptions.serviceTypes.map((s) => (
              <button
                key={s}
                onClick={() => { setFilterServiceType(s); setShowServiceDropdown(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  filterServiceType === s ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasActiveFilter && (
        <button
          onClick={clearFilters}
          className="p-1 text-slate-500 hover:text-slate-300 rounded transition-colors"
          title="Clear filters"
        >
          <X size={15} />
        </button>
      )}

      {hasActiveFilter && wsState === 'has_lead' && (
        <span className="ml-auto text-xs text-slate-500">
          {remainingCount} lead{remainingCount !== 1 ? 's' : ''} remaining
        </span>
      )}

      {!hasActiveFilter && (
        <button
          onClick={() => navigate('/caller/followups')}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200 transition-colors"
        >
          <Calendar size={14} /> Follow-ups
        </button>
      )}
    </div>
  );

  if (wsState === 'loading') {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-[#080C14] flex flex-col">
        {filterBar}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (wsState === 'no_leads_for_filter') {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-[#080C14] flex flex-col">
        {filterBar}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex items-center justify-center py-16"
        >
          <div className="text-center max-w-sm px-4">
            <div className="w-16 h-16 bg-slate-800/80 border border-white/[0.08] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Calendar size={28} className="text-slate-500" />
            </div>
            <h2 className="text-lg font-semibold text-white">No leads match this filter</h2>
            <p className="text-slate-500 text-sm mt-2">
              There are no pending leads for the selected date and/or service type.
            </p>
            <p className="text-slate-600 text-xs mt-1">Try a different filter or clear it.</p>
            <button
              onClick={clearFilters}
              className="mt-6 px-4 py-2 border border-white/[0.08] text-slate-300 rounded-lg text-sm hover:bg-white/[0.04] transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (wsState === 'all_done') {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-[#080C14] flex flex-col">
        {filterBar}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex items-center justify-center py-16"
        >
          <div className="text-center">
            <div className="w-16 h-16 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <PhoneOff size={28} className="text-cyan-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">All caught up!</h2>
            <p className="text-slate-500 mt-1 text-sm">All pending leads have been processed.</p>
            <button
              onClick={() => { loadFilterOptions(); fetchNextLead(); }}
              className="mt-5 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
            >
              Refresh
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!lead) return null;

  // Per requirement #2: show ALL data. Build the metadata entries from extra_data.
  const extraEntries = Object.entries(lead.extra_data ?? {});

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#080C14] flex flex-col">
      {filterBar}

      <div className="py-5 px-3 flex-1">
        <div className="max-w-xl mx-auto space-y-3">

          {hasActiveFilter && (
            <div className="text-center">
              <span className="inline-flex items-center gap-1 text-xs bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full font-medium">
                {remainingCount} lead{remainingCount !== 1 ? 's' : ''} remaining
              </span>
            </div>
          )}

          {/* Lead card — shows every field */}
          <motion.div
            key={lead.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl shadow-lg overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-600/10 border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-white font-bold text-xl leading-tight truncate">
                    {lead.customer_name || 'Unknown Customer'}
                  </h2>
                  {lead.phone && (
                    <a
                      href={`tel:${lead.phone}`}
                      className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 text-base mt-0.5 font-mono transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {lead.phone}
                    </a>
                  )}
                </div>
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-full p-3 hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                  >
                    <Phone size={22} />
                  </a>
                )}
              </div>
            </div>

            {/* Body — all standard fields + metadata */}
            <div className="p-4 space-y-4">
              <section>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Vehicle Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Registration No." value={lead.vehicle_number} />
                  <Field label="Model" value={lead.vehicle_model} />
                </div>
              </section>

              <section className="bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-3">
                <p className="text-[10px] font-bold text-amber-400/80 uppercase tracking-widest mb-2">Service Info</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Next Service Date" value={fmtDate(getNextServiceDate(lead))} />
                  <Field label="Next Service Type" value={getNextServiceType(lead)} />
                  <Field label="Last Service Date" value={fmtDate(lead.service_pending_date)} />
                  <Field label="Last Service Type" value={lead.service_type} />
                </div>
              </section>

              <section className="bg-red-500/[0.08] border border-red-500/20 rounded-xl p-3">
                <Field label="Insurance Expiry" value={fmtDate(lead.insurance_expiry_date)} />
              </section>

              <section>
                <div className="grid grid-cols-1 gap-2">
                  <Field label="Address" value={lead.address} />
                  <Field label="Email" value={lead.email} />
                </div>
              </section>

              {extraEntries.length > 0 && (
                <section className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Additional Info</p>
                  <div className="grid grid-cols-2 gap-3">
                    {extraEntries.map(([key, val]) => (
                      <Field key={key} label={key} value={String(val)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </motion.div>

          {/* Call outcome panel */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.25 }}
            className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-4 space-y-4"
          >
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
              <PhoneCall size={16} className="text-cyan-400" /> Log Call Outcome
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.label}
                  onClick={() => setSelectedOutcome(o.label)}
                  className={`text-left text-sm px-3 py-2 rounded-xl border transition-all ${
                    selectedOutcome === o.label
                      ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400 font-semibold'
                      : 'border-white/[0.08] hover:border-white/[0.16] text-slate-300'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {selectedOutcome === 'Callback Scheduled' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <label className="block text-sm text-slate-400 mb-1.5 flex items-center gap-1">
                  <Calendar size={14} /> Callback Date
                </label>
                <input
                  type="date"
                  value={callback ? callback.split('T')[0] : ''}
                  onChange={(e) => setCallback(e.target.value)}
                  className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                />
              </motion.div>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add notes about the call..."
                className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={skipLead}
                className="px-4 py-3 border border-white/[0.08] text-slate-400 rounded-xl text-sm font-medium hover:bg-white/[0.04] hover:text-slate-200 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={submitCall}
                disabled={!selectedOutcome || saving}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl font-semibold hover:shadow-lg hover:shadow-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
              >
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                ) : (
                  <><Save size={16} /> Save &amp; Next Lead</>
                )}
              </button>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
