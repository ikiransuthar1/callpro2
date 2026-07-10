import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Phone,
  ThumbsUp,
  Clock,
  Download,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Dealer } from '../../types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DealerAnalytics {
  dealer: Dealer;
  totalLeads: number;
  callsMade: number;
  interested: number;
  notInterested: number;
  followUps: number;
  interestedRate: number;
}

interface SummaryStats {
  totalLeads: number;
  totalCalls: number;
  interestedRate: number;
  followUpsPending: number;
}

// ─── Animation variants ───────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' },
  }),
};

export default function FounderAnalytics() {
  useAuth(); // ensure auth context is accessible
  const [dealerStats, setDealerStats] = useState<DealerAnalytics[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({
    totalLeads: 0,
    totalCalls: 0,
    interestedRate: 0,
    followUpsPending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof DealerAnalytics>('callsMade');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all dealers
      const { data: dealers, error: dealerError } = await supabase
        .from('dealers')
        .select('*')
        .order('created_at', { ascending: false });

      if (dealerError) throw dealerError;

      // 2. Fetch all leads (id, dealer_id, status)
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, dealer_id, status');

      if (leadsError) throw leadsError;

      // 3. Fetch all call_logs (dealer_id, action, follow_up_date)
      const { data: callLogs, error: logsError } = await supabase
        .from('call_logs')
        .select('dealer_id, action, follow_up_date, called_at');

      if (logsError) throw logsError;

      const dealerList: Dealer[] = dealers ?? [];
      const leadsList = leads ?? [];
      const logsList = callLogs ?? [];

      // 4. Aggregate per dealer
      const stats: DealerAnalytics[] = dealerList.map((dealer) => {
        const dLeads = leadsList.filter((l) => l.dealer_id === dealer.id);
        const dLogs = logsList.filter((l) => l.dealer_id === dealer.id);

        const totalLeads = dLeads.length;
        const callsMade = dLogs.length;
        const interested = dLogs.filter((l) => l.action === 'interested').length;
        const notInterested = dLogs.filter((l) => l.action === 'not_interested').length;
        const followUps = dLeads.filter((l) => l.status === 'follow_up').length;
        const interestedRate = callsMade > 0 ? Math.round((interested / callsMade) * 100) : 0;

        return {
          dealer,
          totalLeads,
          callsMade,
          interested,
          notInterested,
          followUps,
          interestedRate,
        };
      });

      setDealerStats(stats);

      // 5. Summary totals
      const totalLeads = leadsList.length;
      const totalCalls = logsList.length;
      const totalInterested = logsList.filter((l) => l.action === 'interested').length;
      const overallRate = totalCalls > 0 ? Math.round((totalInterested / totalCalls) * 100) : 0;
      const followUpsPending = leadsList.filter((l) => l.status === 'follow_up').length;

      setSummary({
        totalLeads,
        totalCalls,
        interestedRate: overallRate,
        followUpsPending,
      });
    } catch (err: unknown) {
      toast.error('Failed to load analytics data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // ─── Sorting ───────────────────────────────────────────────────────────────

  const handleSort = (key: keyof DealerAnalytics) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...dealerStats].sort((a, b) => {
    const av = sortKey === 'dealer' ? (a.dealer as Dealer).company_name : (a[sortKey] as number);
    const bv = sortKey === 'dealer' ? (b.dealer as Dealer).company_name : (b[sortKey] as number);
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  // ─── Export ────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const rows = sorted.map((s) => ({
      'Dealer Name': s.dealer.company_name,
      'Owner': s.dealer.owner_name,
      'Plan': s.dealer.subscription_plan,
      'Status': s.dealer.subscription_status,
      'Total Leads': s.totalLeads,
      'Calls Made': s.callsMade,
      'Interested': s.interested,
      'Not Interested': s.notInterested,
      'Follow-ups Pending': s.followUps,
      'Interested Rate (%)': s.interestedRate,
    }));

    // Summary sheet
    const summaryRows = [
      { Metric: 'Total Leads', Value: summary.totalLeads },
      { Metric: 'Total Calls Made', Value: summary.totalCalls },
      { Metric: 'Interested Rate (%)', Value: summary.interestedRate },
      { Metric: 'Follow-ups Pending', Value: summary.followUpsPending },
    ];

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsDealer = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    XLSX.utils.book_append_sheet(wb, wsDealer, 'Per-Dealer Breakdown');
    XLSX.writeFile(wb, `analytics_export_${Date.now()}.xlsx`);
    toast.success('Analytics exported to Excel');
  };

  // ─── Summary cards config ──────────────────────────────────────────────────

  const summaryCards = [
    {
      label: 'Total Leads',
      value: summary.totalLeads.toLocaleString(),
      icon: Users,
      iconBg: 'bg-cyan-500/10',
      iconColor: 'text-cyan-400',
      border: 'border-cyan-500/20',
    },
    {
      label: 'Total Calls Made',
      value: summary.totalCalls.toLocaleString(),
      icon: Phone,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
      border: 'border-blue-500/20',
    },
    {
      label: 'Interested Rate',
      value: `${summary.interestedRate}%`,
      icon: ThumbsUp,
      iconBg: 'bg-green-500/10',
      iconColor: 'text-green-400',
      border: 'border-green-500/20',
    },
    {
      label: 'Follow-ups Pending',
      value: summary.followUpsPending.toLocaleString(),
      icon: Clock,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      border: 'border-amber-500/20',
    },
  ];

  // ─── Table columns config ──────────────────────────────────────────────────

  const columns: { label: string; key: keyof DealerAnalytics; align?: 'right' }[] = [
    { label: 'Dealer', key: 'dealer' },
    { label: 'Total Leads', key: 'totalLeads', align: 'right' },
    { label: 'Calls Made', key: 'callsMade', align: 'right' },
    { label: 'Interested', key: 'interested', align: 'right' },
    { label: 'Not Interested', key: 'notInterested', align: 'right' },
    { label: 'Follow-ups', key: 'followUps', align: 'right' },
    { label: 'Interest Rate', key: 'interestedRate', align: 'right' },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics & Reports</h1>
          <p className="text-slate-400 mt-1 text-sm">Platform-wide performance breakdown across all dealers</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-white/[0.08] text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={loading || dealerStats.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium px-4 py-2 rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {summaryCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className={`bg-slate-900/80 backdrop-blur border ${card.border} rounded-2xl p-5 flex items-center gap-4`}
            >
              <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{card.label}</p>
                {loading ? (
                  <div className="h-7 w-14 bg-slate-700/60 rounded animate-pulse mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-white mt-0.5">{card.value}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Per-Dealer Breakdown Table */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.4, ease: 'easeOut' }}
        className="bg-slate-900/60 rounded-2xl border border-white/[0.06] overflow-hidden"
      >
        {/* Table header bar */}
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Per-Dealer Performance</h2>
              <p className="text-slate-500 text-xs mt-0.5">Click column headers to sort</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <TrendingUp className="w-3.5 h-3.5" />
            {dealerStats.length} dealers
          </div>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-14 text-center">
            <BarChart3 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No data available yet. Data will appear as callers log calls.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  {columns.map((col) => (
                    <th
                      key={col.key as string}
                      onClick={() => handleSort(col.key)}
                      className={`text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3.5 cursor-pointer hover:text-slate-300 transition-colors select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      <span className="flex items-center gap-1 justify-inherit">
                        {col.label}
                        {sortKey === col.key && (
                          <span className="text-cyan-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <motion.tr
                    key={row.dealer.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.04 }}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Dealer Name */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-cyan-400 text-xs font-bold">
                            {row.dealer.company_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium">{row.dealer.company_name}</p>
                          <p className="text-xs text-slate-500 capitalize">{row.dealer.subscription_plan} plan</p>
                        </div>
                      </div>
                    </td>
                    {/* Total Leads */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-white font-medium">{row.totalLeads.toLocaleString()}</span>
                    </td>
                    {/* Calls Made */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-cyan-300 font-medium">{row.callsMade.toLocaleString()}</span>
                    </td>
                    {/* Interested */}
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex items-center justify-end gap-1 text-sm text-green-400 font-medium">
                        {row.interested.toLocaleString()}
                      </span>
                    </td>
                    {/* Not Interested */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-red-400 font-medium">{row.notInterested.toLocaleString()}</span>
                    </td>
                    {/* Follow-ups */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-amber-400 font-medium">{row.followUps.toLocaleString()}</span>
                    </td>
                    {/* Interest Rate */}
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex flex-col items-end gap-1">
                        <span className="text-sm text-white font-medium">{row.interestedRate}%</span>
                        <div className="w-20 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
                            style={{ width: `${Math.min(row.interestedRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr className="border-t border-white/[0.08] bg-slate-800/20">
                  <td className="px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Platform Total
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-white">
                    {summary.totalLeads.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-cyan-300">
                    {summary.totalCalls.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-green-400">
                    {sorted.reduce((acc, r) => acc + r.interested, 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-red-400">
                    {sorted.reduce((acc, r) => acc + r.notInterested, 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-amber-400">
                    {summary.followUpsPending.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold text-white">
                    {summary.interestedRate}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
