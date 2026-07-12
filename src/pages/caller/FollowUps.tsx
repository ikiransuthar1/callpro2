// Updated on 11 July
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Phone, Clock, AlertTriangle, CheckCircle,
  ChevronRight, PhoneCall, User, FileText, RefreshCw,
  Inbox,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { CallLog, Lead } from '../../types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FollowUpEntry extends CallLog {
  leads: Lead;
}

type UrgencyGroup = 'overdue' | 'today' | 'upcoming';

interface GroupedFollowUps {
  overdue: FollowUpEntry[];
  today: FollowUpEntry[];
  upcoming: FollowUpEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUrgency(followUpDate: string): UrgencyGroup {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(followUpDate);
  date.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  return 'upcoming';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatRelative(followUpDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(followUpDate);
  date.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < -1) return `${Math.abs(diff)} days overdue`;
  if (diff === -1) return 'Yesterday';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    interested: 'Interested',
    not_interested: 'Not Interested',
    call_later: 'Call Later',
    no_answer: 'No Answer',
    busy: 'Busy',
    wrong_number: 'Wrong Number',
    completed: 'Completed',
  };
  return map[action] ?? action;
}

// ─── Group config ─────────────────────────────────────────────────────────────

const GROUP_CONFIG: Record<UrgencyGroup, {
  label: string;
  description: string;
  icon: React.ElementType;
  dotColor: string;
  badgeCls: string;
  headerCls: string;
  borderCls: string;
  glowCls: string;
}> = {
  overdue: {
    label: 'Overdue',
    description: 'These follow-ups are past their scheduled date',
    icon: AlertTriangle,
    dotColor: 'bg-red-400',
    badgeCls: 'bg-red-500/15 border-red-500/30 text-red-400',
    headerCls: 'text-red-400',
    borderCls: 'border-l-red-500/60',
    glowCls: 'shadow-red-500/5',
  },
  today: {
    label: 'Due Today',
    description: "Follow-ups scheduled for today",
    icon: Clock,
    dotColor: 'bg-amber-400',
    badgeCls: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    headerCls: 'text-amber-400',
    borderCls: 'border-l-amber-500/60',
    glowCls: 'shadow-amber-500/5',
  },
  upcoming: {
    label: 'Upcoming',
    description: 'Scheduled for the next 3 days',
    icon: Calendar,
    dotColor: 'bg-cyan-400',
    badgeCls: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',
    headerCls: 'text-cyan-400',
    borderCls: 'border-l-cyan-500/60',
    glowCls: 'shadow-cyan-500/5',
  },
};

// ─── Follow-up card ───────────────────────────────────────────────────────────

function FollowUpCard({
  entry,
  urgency,
  onCallNow,
  index,
}: {
  entry: FollowUpEntry;
  urgency: UrgencyGroup;
  onCallNow: (leadId: string) => void;
  index: number;
}) {
  const cfg = GROUP_CONFIG[urgency];
  const lead = entry.leads;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`bg-slate-900/80 backdrop-blur border border-white/[0.08] border-l-2 ${cfg.borderCls} rounded-2xl shadow-lg ${cfg.glowCls} overflow-hidden hover:border-white/[0.14] transition-all group`}
    >
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <h3 className="text-base font-semibold text-white truncate">
                {lead.customer_name || 'Unknown Customer'}
              </h3>
            </div>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-mono mt-0.5"
              >
                <Phone className="w-3 h-3" />
                {lead.phone}
              </a>
            )}
          </div>

          {/* Date badge */}
          <div className={`flex flex-col items-end gap-1 shrink-0`}>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${cfg.badgeCls}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} ${urgency === 'overdue' ? 'animate-pulse' : ''}`} />
              {entry.follow_up_date ? formatRelative(entry.follow_up_date) : '—'}
            </div>
            {entry.follow_up_date && (
              <span className="text-[10px] text-slate-500">{formatDate(entry.follow_up_date)}</span>
            )}
          </div>
        </div>

        {/* Body grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Vehicle */}
          {lead.vehicle_number && (
            <div className="bg-white/[0.03] rounded-xl px-3 py-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Vehicle</p>
              <p className="text-xs text-slate-300 font-mono mt-0.5">{lead.vehicle_number}</p>
              {lead.vehicle_model && (
                <p className="text-[10px] text-slate-500 mt-0.5">{lead.vehicle_model}</p>
              )}
            </div>
          )}

          {/* Last action */}
          <div className="bg-white/[0.03] rounded-xl px-3 py-2">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Last Action</p>
            <p className="text-xs text-slate-300 mt-0.5">{actionLabel(entry.action)}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {new Date(entry.called_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>

          {/* Next Service Date */}
          {(lead.next_service_date || lead.service_pending_date) && (
            <div className="col-span-2 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl px-3 py-2">
              <p className="text-[10px] text-amber-500/70 uppercase tracking-wider font-medium flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> Next Service
                {(lead.next_service_type || lead.service_type) && (
                  <span className="ml-auto px-2 py-0.5 bg-amber-500/15 border border-amber-500/25 rounded-full text-[10px] font-bold text-amber-400">
                    {lead.next_service_type ?? lead.service_type}
                  </span>
                )}
              </p>
              <p className="text-sm font-bold text-amber-300 mt-1">
                {(() => {
                  const raw = lead.next_service_date ?? lead.service_pending_date;
                  if (!raw) return '—';
                  const [y, m, d] = raw.split('-');
                  return `${d}-${m}-${y}`;
                })()}
              </p>
            </div>
          )}
        </div>

        {/* Notes */}
        {entry.excuse_notes && (
          <div className="flex items-start gap-2 mb-4 px-3 py-2.5 bg-white/[0.03] rounded-xl">
            <FileText className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{entry.excuse_notes}</p>
          </div>
        )}

        {/* Call Now button */}
        <button
          onClick={() => onCallNow(lead.id)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all
            ${urgency === 'overdue'
              ? 'bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 hover:text-red-200'
              : urgency === 'today'
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200'
              : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300'
            }`}
        >
          <PhoneCall className="w-3.5 h-3.5" />
          Call Now
          <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function GroupSection({
  group,
  entries,
  onCallNow,
}: {
  group: UrgencyGroup;
  entries: FollowUpEntry[];
  onCallNow: (leadId: string) => void;
}) {
  const cfg = GROUP_CONFIG[group];
  const Icon = cfg.icon;
  const [expanded, setExpanded] = useState(true);

  if (entries.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Section header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-3 mb-4 w-full group"
      >
        <div className={`flex items-center gap-2 ${cfg.headerCls}`}>
          <Icon className="w-4 h-4" />
          <h2 className="text-sm font-bold tracking-wide uppercase">{cfg.label}</h2>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.badgeCls}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
          {entries.length}
        </div>
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors">
          {expanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {entries.map((entry, i) => (
                <FollowUpCard
                  key={entry.id}
                  entry={entry}
                  urgency={group}
                  onCallNow={onCallNow}
                  index={i}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FollowUps() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [grouped, setGrouped] = useState<GroupedFollowUps>({ overdue: [], today: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchFollowUps = useCallback(async (showRefreshToast = false) => {
    if (!profile?.dealer_id) return;

    try {
      // Upper bound: today + 3 days for "upcoming"
      const upperBound = new Date();
      upperBound.setDate(upperBound.getDate() + 3);
      const upperStr = upperBound.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('call_logs')
        .select('*, leads(*)')
        .eq('dealer_id', profile.dealer_id)
        .eq('action', 'call_later')
        .not('follow_up_date', 'is', null)
        .lte('follow_up_date', upperStr)
        .order('follow_up_date', { ascending: true });

      if (error) throw error;

      const entries = (data ?? []) as FollowUpEntry[];

      // Only keep the latest log per lead (de-duplicate)
      const latestByLead = new Map<string, FollowUpEntry>();
      for (const entry of entries) {
        const existing = latestByLead.get(entry.lead_id);
        if (!existing || new Date(entry.called_at) > new Date(existing.called_at)) {
          latestByLead.set(entry.lead_id, entry);
        }
      }

      const deduped = Array.from(latestByLead.values());

      // Also filter: only include leads whose current status is 'follow_up'
      const activeFollowUps = deduped.filter(e => e.leads?.status === 'follow_up');

      const result: GroupedFollowUps = { overdue: [], today: [], upcoming: [] };
      for (const entry of activeFollowUps) {
        if (entry.follow_up_date) {
          const group = getUrgency(entry.follow_up_date);
          result[group].push(entry);
        }
      }

      setGrouped(result);

      if (showRefreshToast) {
        toast.success('Follow-ups refreshed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load follow-ups';
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFollowUps(true);
  };

  const handleCallNow = (leadId: string) => {
    // Navigate to workspace with lead pre-selected via state
    navigate('/caller', { state: { preloadLeadId: leadId } });
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const total = grouped.overdue.length + grouped.today.length + grouped.upcoming.length;
  const hasAny = total > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080C14] p-8">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-400" />
            Follow-ups
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Scheduled callbacks — overdue first
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Summary chips */}
          {!loading && (
            <div className="flex items-center gap-2">
              {grouped.overdue.length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  {grouped.overdue.length} overdue
                </span>
              )}
              {grouped.today.length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold rounded-full">
                  <Clock className="w-3 h-3" />
                  {grouped.today.length} today
                </span>
              )}
              {grouped.upcoming.length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold rounded-full">
                  <Calendar className="w-3 h-3" />
                  {grouped.upcoming.length} upcoming
                </span>
              )}
            </div>
          )}

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 border border-white/[0.08] rounded-xl text-sm text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-60"
          >
            <motion.div
              animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
              transition={{ repeat: refreshing ? Infinity : 0, duration: 0.8, ease: 'linear' }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </motion.div>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            />
          </div>
          <p className="text-sm text-slate-500">Loading follow-ups…</p>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !hasAny && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 gap-4"
        >
          <div className="w-16 h-16 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-cyan-400" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-white">No follow-ups due</h2>
            <p className="text-sm text-slate-500 mt-1">
              All caught up! No overdue or upcoming callbacks in the next 3 days.
            </p>
          </div>
          <button
            onClick={() => navigate('/caller')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition-all"
          >
            <Inbox className="w-4 h-4" />
            Go to Workspace
          </button>
        </motion.div>
      )}

      {/* ── Groups ───────────────────────────────────────────────────────── */}
      {!loading && hasAny && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <GroupSection group="overdue"  entries={grouped.overdue}  onCallNow={handleCallNow} />
            <GroupSection group="today"    entries={grouped.today}    onCallNow={handleCallNow} />
            <GroupSection group="upcoming" entries={grouped.upcoming} onCallNow={handleCallNow} />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
