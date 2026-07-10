import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, FolderOpen, PhoneCall, TrendingUp, ThumbsUp, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile, Lead, LeadFile, CallLog } from '../../types/database';
import toast from 'react-hot-toast';

interface CallerRow {
  id: string;
  full_name: string | null;
  email: string;
  leadsAssigned: number;
  callsToday: number;
  interestedCount: number;
}

interface DashboardStats {
  totalCallers: number;
  activeFiles: number;
  totalLeads: number;
  callsToday: number;
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: 'easeOut' },
  }),
};

const tableRowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: 0.3 + i * 0.06, duration: 0.35, ease: 'easeOut' },
  }),
};

export default function DealerDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalCallers: 0,
    activeFiles: 0,
    totalLeads: 0,
    callsToday: 0,
  });
  const [callerRows, setCallerRows] = useState<CallerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const dealerId = profile?.dealer_id ?? profile?.id;

  useEffect(() => {
    if (!dealerId) return;
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId]);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [callersRes, filesRes, leadsRes, callLogsRes, todayLogsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'caller')
          .eq('dealer_id', dealerId),
        supabase
          .from('lead_files')
          .select('id, file_name, total_records, created_at')
          .eq('dealer_id', dealerId),
        supabase
          .from('leads')
          .select('id, assigned_caller_id')
          .eq('dealer_id', dealerId),
        supabase
          .from('call_logs')
          .select('id, caller_id, action, called_at')
          .eq('dealer_id', dealerId)
          .gte('called_at', todayStart.toISOString()),
        supabase
          .from('call_logs')
          .select('id')
          .eq('dealer_id', dealerId)
          .gte('called_at', todayStart.toISOString()),
      ]);

      if (callersRes.error) throw callersRes.error;
      if (filesRes.error) throw filesRes.error;
      if (leadsRes.error) throw leadsRes.error;
      if (callLogsRes.error) throw callLogsRes.error;

      const callers: Profile[] = callersRes.data ?? [];
      const files: LeadFile[] = (filesRes.data ?? []) as unknown as LeadFile[];
      const leads: Pick<Lead, 'id' | 'assigned_caller_id'>[] = leadsRes.data ?? [];
      const todayLogs: Pick<CallLog, 'id' | 'caller_id' | 'action' | 'called_at'>[] =
        (callLogsRes.data ?? []) as unknown as Pick<CallLog, 'id' | 'caller_id' | 'action' | 'called_at'>[];

      setStats({
        totalCallers: callers.length,
        activeFiles: files.length,
        totalLeads: leads.length,
        callsToday: todayLogs.length,
      });

      const rows: CallerRow[] = callers.map((c) => {
        const myLeads = leads.filter((l) => l.assigned_caller_id === c.id);
        const myCallsToday = todayLogs.filter((cl) => cl.caller_id === c.id);
        const interested = myCallsToday.filter((cl) => cl.action === 'interested');
        return {
          id: c.id,
          full_name: c.full_name,
          email: c.email,
          leadsAssigned: myLeads.length,
          callsToday: myCallsToday.length,
          interestedCount: interested.length,
        };
      });

      rows.sort((a, b) => b.callsToday - a.callsToday);
      setCallerRows(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      label: 'Total Callers',
      value: stats.totalCallers,
      icon: Users,
      color: 'text-cyan-400',
      bg: 'bg-cyan-400/10',
    },
    {
      label: 'Active Files',
      value: stats.activeFiles,
      icon: FolderOpen,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      label: 'Total Leads',
      value: stats.totalLeads,
      icon: TrendingUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
    {
      label: 'Calls Today',
      value: stats.callsToday,
      icon: PhoneCall,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
    },
  ];

  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white tracking-tight">Dealer Dashboard</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Welcome back, {profile?.full_name ?? profile?.email}
        </p>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-6 flex items-center gap-5"
            >
              <div className={`${card.bg} rounded-xl p-3 shrink-0`}>
                <Icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
                  {card.label}
                </p>
                {loading ? (
                  <div className="h-7 w-12 bg-slate-700/60 rounded animate-pulse mt-1" />
                ) : (
                  <p className="text-white text-2xl font-bold mt-0.5">{card.value}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Caller Performance Table */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.45 }}
        className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h2 className="text-white font-semibold text-lg">Caller Performance</h2>
          </div>
          <button
            onClick={fetchDashboard}
            className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : callerRows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No callers added yet.</p>
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
                    Leads Assigned
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Calls Today
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Interested
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Conv. Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {callerRows.map((row, i) => {
                  const rate =
                    row.callsToday > 0
                      ? ((row.interestedCount / row.callsToday) * 100).toFixed(1)
                      : '—';
                  return (
                    <motion.tr
                      key={row.id}
                      custom={i}
                      initial="hidden"
                      animate="visible"
                      variants={tableRowVariants}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-cyan-400/10 flex items-center justify-center shrink-0">
                            <span className="text-cyan-400 text-xs font-bold">
                              {(row.full_name ?? row.email).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-white font-medium">
                              {row.full_name ?? '—'}
                            </p>
                            <p className="text-slate-500 text-xs">{row.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-300 font-medium">
                        {row.leadsAssigned}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-white font-semibold">{row.callsToday}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <ThumbsUp className="w-3.5 h-3.5" />
                          {row.interestedCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`font-medium ${
                            row.callsToday === 0
                              ? 'text-slate-500'
                              : Number(rate) >= 30
                              ? 'text-emerald-400'
                              : Number(rate) >= 15
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}
                        >
                          {rate === '—' ? rate : `${rate}%`}
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
    </div>
  );
}
