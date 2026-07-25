import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Phone, PhoneCall, Calendar, Save, Filter, X, PhoneOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Lead, CallAction, LeadStatus } from '../../types/database';

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
  try {
    const [y, m, day] = d.split('-');
    return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

// Robust blank check — hides null, empty, whitespace, and placeholder strings
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s === '' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'na' || s.toLowerCase() === 'n/a') return false;
  return true;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!hasValue(value)) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-200 mt-0.5 break-words">{String(value).trim()}</p>
    </div>
  );
}

type WorkspaceState = 'loading' | 'has_lead' | 'no_leads_for_date' | 'all_done';

export default function CallerWorkspace() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [filterDate, setFilterDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [wsState, setWsState] = useState<WorkspaceState>('loading');
  const [lead, setLead] = useState<Lead | null>(null);
  const [remainingCount, setRemainingCount] = useState(0);

  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [callback, setCallback] = useState('');
  const [saving, setSaving] = useState(false);

  const lockedLeadId = useRef<string | null>(null);

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

    if (filterDate) {
      query = query.eq('next_service_date', filterDate);
    }

    const { data } = await query
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) {
      await supabase
        .from('leads')
        .update({ locked_by: profile.id, locked_at: new Date().toISOString() })
        .eq('id', data.id);

      lockedLeadId.current = data.id;
      setLead(data as Lead);

      let countQ = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('dealer_id', profile.dealer_id)
        .eq('status', 'pending')
        .is('locked_by', null);
      if (filterDate) countQ = countQ.eq('next_service_date', filterDate);
      const { count } = await countQ;
      setRemainingCount(count ?? 0);
      setWsState('has_lead');
    } else {
      setLead(null);
      lockedLeadId.current = null;
      setRemainingCount(0);
      setWsState(filterDate ? 'no_leads_for_date' : 'all_done');
    }
  }, [profile?.dealer_id, profile?.id, filterDate]);

  useEffect(() => { fetchNextLead(); }, [fetchNextLead]);

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

  const filterBar = (
    <div className="bg-slate-900/80 backdrop-blur border-b border-white/[0.06] px-5 py-2.5 flex items-center gap-2 flex-wrap sticky top-0 z-10">
      <button
        onClick={() => setShowDatePicker((s) => !s)}
        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
          filterDate
            ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-medium'
            : 'border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
        }`}
      >
        <Filter size={14} />
        {filterDate ? `Next Service: ${fmtDate(filterDate)}` : 'Filter by Next Service Date'}
      </button>

      {filterDate && (
        <button
          onClick={() => { setFilterDate(''); setShowDatePicker(false); }}
          className="p-1 text-slate-500 hover:text-slate-300 rounded transition-colors"
          title="Clear filter"
        >
          <X size={15} />
        </button>
      )}

      {showDatePicker && (
        <input
          type="date"
          value={filterDate}
          autoFocus
          onChange={(e) => { setFilterDate(e.target.value); setShowDatePicker(false); }}
          onBlur={() => setShowDatePicker(false)}
          className="bg-slate-800 border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
        />
      )}

      {filterDate && wsState === 'has_lead' && (
        <span className="ml-auto text-xs text-slate-500">
          {remainingCount} lead{remainingCount !== 1 ? 's' : ''} remaining
        </span>
      )}

      {!filterDate && (
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

  if (wsState === 'no_leads_for_date') {
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
            <h2 className="text-lg font-semibold text-white">No leads for this date</h2>
            <p className="text-slate-500 text-sm mt-2">
              There are no pending leads with a next service date of{' '}
              <span className="font-medium text-slate-300">{fmtDate(filterDate)}</span>.
            </p>
            <p className="text-slate-600 text-xs mt-1">Try selecting a different date.</p>
            <div className="flex gap-2 justify-center mt-6">
              <button
                onClick={() => setFilterDate('')}
                className="px-4 py-2 border border-white/[0.08] text-slate-300 rounded-lg text-sm hover:bg-white/[0.04] transition-colors"
              >
                Clear Filter
              </button>
              <button
                onClick={() => setShowDatePicker(true)}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-cyan-500/20 transition-all"
              >
                Pick Another Date
              </button>
            </div>
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
              onClick={() => fetchNextLead()}
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

  const extraEntries = Object.entries(lead.extra_data ?? {}).filter(([, v]) => hasValue(v));

  const hasVehicleInfo = hasValue(lead.vehicle_number) || hasValue(lead.vehicle_model);
  const hasServiceInfo =
    hasValue(lead.next_service_date) || hasValue(lead.next_service_type) ||
    hasValue(lead.service_pending_date) || hasValue(lead.service_type);
  const hasInsurance = hasValue(lead.insurance_expiry_date);
  const hasContactInfo = hasValue(lead.address) || hasValue(lead.email);
  const hasExtra = extraEntries.length > 0;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#080C14] flex flex-col">
      {filterBar}

      <div className="py-5 px-3 flex-1">
        <div className="max-w-xl mx-auto space-y-3">

          {filterDate && (
            <div className="text-center">
              <span className="inline-flex items-center gap-1 text-xs bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full font-medium">
                {remainingCount} lead{remainingCount !== 1 ? 's' : ''} pending for {fmtDate(filterDate)}
              </span>
            </div>
          )}

          {/* Lead card */}
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
                    {hasValue(lead.customer_name) ? lead.customer_name : 'Unknown Customer'}
                  </h2>
                  {hasValue(lead.phone) && (
                    <a
                      href={`tel:${lead.phone}`}
                      className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 text-base mt-0.5 font-mono transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {lead.phone}
                    </a>
                  )}
                </div>
                {hasValue(lead.phone) && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-full p-3 hover:shadow-lg hover:shadow-cyan-500/30 transition-all"
                  >
                    <Phone size={22} />
                  </a>
                )}
              </div>
            </div>

            {/* Body — only non-blank sections render */}
            <div className="p-4 space-y-4">
              {hasVehicleInfo && (
                <section>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Vehicle Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Registration No." value={lead.vehicle_number} />
                    <Field label="Model" value={lead.vehicle_model} />
                  </div>
                </section>
              )}

              {hasServiceInfo && (
                <section className="bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-amber-400/80 uppercase tracking-widest mb-2">Service Info</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Next Service Date" value={fmtDate(lead.next_service_date)} />
                    <Field label="Next Service Type" value={lead.next_service_type} />
                    <Field label="Last Service Date" value={fmtDate(lead.service_pending_date)} />
                    <Field label="Last Service Type" value={lead.service_type} />
                  </div>
                </section>
              )}

              {hasInsurance && (
                <section className="bg-red-500/[0.08] border border-red-500/20 rounded-xl p-3">
                  <Field label="Insurance Expiry" value={fmtDate(lead.insurance_expiry_date)} />
                </section>
              )}

              {hasContactInfo && (
                <section>
                  <div className="grid grid-cols-1 gap-2">
                    <Field label="Address" value={lead.address} />
                    <Field label="Email" value={lead.email} />
                  </div>
                </section>
              )}

              {hasExtra && (
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


