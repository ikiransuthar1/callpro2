import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart2,
  Phone,
  ThumbsUp,
  ThumbsDown,
  Clock,
  CalendarClock,
  Download,
  Filter,
  RefreshCw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile, CallAction } from '../../types/database';
import toast from 'react-hot-toast';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface EnrichedLog {
  id: string;
  caller_id: string;
  caller_name: string;
  caller_email: string;
  lead_id: string;
  customer_name: string | null;
  phone: string | null;
  vehicle_model: string | null;
  service_type: string | null;
  action: CallAction;
  excuse_notes: string | null;
  follow_up_date: string | null;
  called_at: string;
}

interface SummaryStats {
  total: number;
  interested: number;
  notInterested: number;
  callLater: number;
  followUp: number;
  noAnswer: number;
}

interface CallerStat {
  caller_id: string;
  caller_name: string;
  total: number;
  interested: number;
  notInterested: number;
  callLater: number;
  noAnswer: number;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: 'easeOut' },
  }),
};

export default function DealerAnalytics() {
  const { profile } = useAuth();
  const dealerId = profile?.dealer_id ?? profile?.id;

  const [logs, setLogs] = useState<EnrichedLog[]>([]);
  const [callers, setCallers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [callerFilter, setCallerFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');

  /* ─── Fetch data ────────────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    if (!dealerId) return;
    setLoading(true);
    try {
      // Fetch callers and logs in parallel.
      // NOTE: call_logs.caller_id references auth.users (no FK to profiles),
      // so we cannot use Supabase auto-join. We fetch profiles separately and merge.
      const [callersRes, logsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, full_name, role, dealer_id, status, created_at, updated_at')
          .eq('dealer_id', dealerId),
        supabase
          .from('call_logs')
          .select(
            `id, caller_id, lead_id, action, excuse_notes, follow_up_date, called_at,
             leads ( id, customer_name, phone, vehicle_model, service_type )`
          )
          .eq('dealer_id', dealerId)
          .gte('called_at', `${dateFrom}T00:00:00`)
          .lte('called_at', `${dateTo}T23:59:59`)
          .order('called_at', { ascending: false }),
      ]);

      if (callersRes.error) throw callersRes.error;
      if (logsRes.error) throw logsRes.error;

      const profileList = (callersRes.data ?? []) as Profile[];
      setCallers(profileList.filter(p => p.role === 'caller'));

      // Build caller_id → profile map for fast lookup
      const callerMap = new Map(profileList.map(p => [p.id, p]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enriched: EnrichedLog[] = (logsRes.data ?? []).map((row: any) => {
        const callerProfile = callerMap.get(row.caller_id);
        return {
          id: row.id,
          caller_id: row.caller_id,
          caller_name: callerProfile?.full_name ?? callerProfile?.email ?? 'Unknown',
          caller_email: callerProfile?.email ?? '',
          lead_id: row.lead_id,
          customer_name: row.leads?.customer_name ?? null,
          phone: row.leads?.phone ?? null,
          vehicle_model: row.leads?.vehicle_model ?? null,
          service_type: row.leads?.service_type ?? null,
          action: row.action as CallAction,
          excuse_notes: row.excuse_notes,
          follow_up_date: row.follow_up_date,
          called_at: row.called_at,
        };
      });

      setLogs(enriched);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load analytics';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [dealerId, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ─── Derived / filtered data ───────────────────────────────────────── */
  const filteredLogs = logs.filter((log) => {
    if (callerFilter !== 'all' && log.caller_id !== callerFilter) return false;
    if (serviceFilter !== 'all' && log.service_type !== serviceFilter) return false;
    return true;
  });

  const serviceTypes = Array.from(
    new Set(logs.map((l) => l.service_type).filter(Boolean) as string[])
  ).sort();

  function computeStats(rows: EnrichedLog[]): SummaryStats {
    return {
      total: rows.length,
      interested: rows.filter((r) => r.action === 'interested').length,
      notInterested: rows.filter((r) => r.action === 'not_interested').length,
      callLater: rows.filter((r) => r.action === 'call_later').length,
      followUp: rows.filter((r) => r.follow_up_date != null).length,
      noAnswer: rows.filter((r) => r.action === 'no_answer').length,
    };
  }

  const summary = computeStats(filteredLogs);

  const callerStats: CallerStat[] = callers.map((c) => {
    const myLogs = filteredLogs.filter((l) => l.caller_id === c.id);
    return {
      caller_id: c.id,
      caller_name: c.full_name ?? c.email,
      total: myLogs.length,
      interested: myLogs.filter((l) => l.action === 'interested').length,
      notInterested: myLogs.filter((l) => l.action === 'not_interested').length,
      callLater: myLogs.filter((l) => l.action === 'call_later').length,
      noAnswer: myLogs.filter((l) => l.action === 'no_answer').length,
    };
  }).filter((s) => s.total > 0).sort((a, b) => b.total - a.total);

  /* ─── Excel Export ──────────────────────────────────────────────────── */
  async function handleExport() {
    setExporting(true);
    try {
      const exportData = filteredLogs.map((log) => ({
        'Called At': new Date(log.called_at).toLocaleString(),
        'Caller Name': log.caller_name,
        'Caller Email': log.caller_email,
        'Customer Name': log.customer_name ?? '',
        Phone: log.phone ?? '',
        'Vehicle Model': log.vehicle_model ?? '',
        'Service Type': log.service_type ?? '',
        Action: log.action.replace(/_/g, ' ').toUpperCase(),
        Notes: log.excuse_notes ?? '',
        'Follow-up Date': log.follow_up_date ?? '',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Call Logs');

      // Auto-size columns
      const colWidths = Object.keys(exportData[0] ?? {}).map((key) => ({
        wch: Math.max(key.length, 14),
      }));
      ws['!cols'] = colWidths;

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      XLSX.writeFile(wb, `call_report_${dateStr}.xlsx`);
      toast.success('Report downloaded');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }

  /* ─── Summary card config ───────────────────────────────────────────── */
  const summaryCards = [
    {
      label: 'Total Calls',
      value: summary.total,
      icon: Phone,
      color: 'text-cyan-400',
      bg: 'bg-cyan-400/10',
    },
    {
      label: 'Interested',
      value: summary.interested,
      icon: ThumbsUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
    {
      label: 'Not Interested',
      value: summary.notInterested,
      icon: ThumbsDown,
      color: 'text-red-400',
      bg: 'bg-red-400/10',
    },
    {
      label: 'Call Later',
      value: summary.callLater,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
    },
    {
      label: 'Follow-ups',
      value: summary.followUp,
      icon: CalendarClock,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
  ];

  /* ─── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-start justify-between mb-8 flex-wrap gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Analytics</h1>
          <p className="text-slate-400 mt-1 text-sm">
            {loading ? 'Loading…' : `${filteredLogs.length} calls in selected range`}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || filteredLogs.length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-5 mb-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300 text-sm font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date From */}
          <div>
            <label className="block text-slate-500 text-xs mb-1.5 uppercase tracking-wide">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition"
            />
          </div>
          {/* Date To */}
          <div>
            <label className="block text-slate-500 text-xs mb-1.5 uppercase tracking-wide">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition"
            />
          </div>
          {/* Caller */}
          <div>
            <label className="block text-slate-500 text-xs mb-1.5 uppercase tracking-wide">
              Caller
            </label>
            <select
              value={callerFilter}
              onChange={(e) => setCallerFilter(e.target.value)}
              className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition appearance-none"
            >
              <option value="all">All Callers</option>
              {callers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name ?? c.email}
                </option>
              ))}
            </select>
          </div>
          {/* Service Type */}
          <div>
            <label className="block text-slate-500 text-xs mb-1.5 uppercase tracking-wide">
              Service Type
            </label>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition appearance-none"
            >
              <option value="all">All Services</option>
              {serviceTypes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-5 mb-8">
        {summaryCards.map((card, i) => {
          const Icon = card.icon;
          const pct =
            summary.total > 0 && card.label !== 'Total Calls'
              ? ((card.value / summary.total) * 100).toFixed(1)
              : null;
          return (
            <motion.div
              key={card.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-5"
            >
              <div className={`${card.bg} rounded-xl p-2.5 w-fit mb-4`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              {loading ? (
                <div className="h-8 w-14 bg-slate-700/60 rounded animate-pulse mb-1" />
              ) : (
                <p className="text-white text-2xl font-bold">{card.value.toLocaleString()}</p>
              )}
              <p className="text-slate-400 text-xs font-medium mt-0.5">{card.label}</p>
              {pct && !loading && (
                <p className={`text-xs mt-1 ${card.color}`}>{pct}% of total</p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Per-Caller Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.45 }}
        className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl overflow-hidden mb-8"
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.06]">
          <BarChart2 className="w-5 h-5 text-cyan-400" />
          <h2 className="text-white font-semibold text-lg">Per-Caller Breakdown</h2>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : callerStats.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No call data for the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Caller
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Total
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Interested
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Not Interested
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Call Later
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    No Answer
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Conv. %
                  </th>
                </tr>
              </thead>
              <tbody>
                {callerStats.map((row, i) => {
                  const conv =
                    row.total > 0 ? ((row.interested / row.total) * 100).toFixed(1) : '0.0';
                  return (
                    <motion.tr
                      key={row.caller_id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.45 + i * 0.05, duration: 0.3 }}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center shrink-0">
                            <span className="text-cyan-400 text-xs font-bold">
                              {row.caller_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-white font-medium">{row.caller_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-white font-semibold">{row.total}</td>
                      <td className="px-6 py-4 text-right text-emerald-400 font-medium">
                        {row.interested}
                      </td>
                      <td className="px-6 py-4 text-right text-red-400 font-medium">
                        {row.notInterested}
                      </td>
                      <td className="px-6 py-4 text-right text-amber-400 font-medium">
                        {row.callLater}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-400">{row.noAnswer}</td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`font-semibold ${
                            Number(conv) >= 30
                              ? 'text-emerald-400'
                              : Number(conv) >= 15
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}
                        >
                          {conv}%
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Recent Calls Log */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.45 }}
        className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.06]">
          <Phone className="w-5 h-5 text-blue-400" />
          <h2 className="text-white font-semibold text-lg">Recent Calls</h2>
          <span className="text-slate-500 text-sm ml-1">
            (showing {Math.min(filteredLogs.length, 50)} of {filteredLogs.length})
          </span>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No calls found for the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Customer
                  </th>
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Caller
                  </th>
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Action
                  </th>
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Notes
                  </th>
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.slice(0, 50).map((log, i) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.55 + i * 0.02, duration: 0.25 }}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-3">
                      <p className="text-white font-medium">{log.customer_name ?? '—'}</p>
                      <p className="text-slate-500 text-xs">{log.phone ?? ''}</p>
                    </td>
                    <td className="px-6 py-3 text-slate-300 text-sm">{log.caller_name}</td>
                    <td className="px-6 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs max-w-[200px] truncate">
                      {log.excuse_notes ?? '—'}
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(log.called_at).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ─── Action Badge component ─────────────────────────────────────────────── */
function ActionBadge({ action }: { action: CallAction }) {
  const config: Record<CallAction, { label: string; className: string }> = {
    interested: { label: 'Interested', className: 'bg-emerald-400/10 text-emerald-400' },
    not_interested: { label: 'Not Interested', className: 'bg-red-400/10 text-red-400' },
    call_later: { label: 'Call Later', className: 'bg-amber-400/10 text-amber-400' },
    no_answer: { label: 'No Answer', className: 'bg-slate-600/40 text-slate-400' },
    busy: { label: 'Busy', className: 'bg-orange-400/10 text-orange-400' },
    wrong_number: { label: 'Wrong #', className: 'bg-slate-700/40 text-slate-500' },
    completed: { label: 'Completed', className: 'bg-blue-400/10 text-blue-400' },
  };

  const c = config[action] ?? { label: action, className: 'bg-slate-700/40 text-slate-400' };

  return (
    <span className={`inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full ${c.className}`}>
      {c.label}
    </span>
  );
}
