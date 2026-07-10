import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, TrendingUp, AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Dealer, Profile } from '../../types/database';

interface DashboardStats {
  totalDealers: number;
  activeDealers: number;
  suspendedDealers: number;
  totalCallers: number;
}

interface RecentActivity {
  dealer: Dealer;
  callerCount: number;
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' },
  }),
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active: {
    label: 'Active',
    color: 'text-green-400 bg-green-500/10 border-green-500/20',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  suspended: {
    label: 'Suspended',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

export default function FounderDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalDealers: 0,
    activeDealers: 0,
    suspendedDealers: 0,
    totalCallers: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch all dealers
      const { data: dealers, error: dealersError } = await supabase
        .from('dealers')
        .select('*')
        .order('created_at', { ascending: false });

      if (dealersError) throw dealersError;

      // Fetch all caller profiles
      const { data: callerProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'caller');

      if (profilesError) throw profilesError;

      const dealerList: Dealer[] = dealers ?? [];
      const callerList: Profile[] = callerProfiles ?? [];

      setStats({
        totalDealers: dealerList.length,
        activeDealers: dealerList.filter((d) => d.subscription_status === 'active').length,
        suspendedDealers: dealerList.filter((d) => d.subscription_status === 'suspended').length,
        totalCallers: callerList.length,
      });

      // Build recent activity: last 8 dealers with caller counts
      const recent = dealerList.slice(0, 8).map((dealer) => ({
        dealer,
        callerCount: callerList.filter((p) => p.dealer_id === dealer.id).length,
      }));
      setRecentActivity(recent);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      label: 'Total Dealers',
      value: stats.totalDealers,
      icon: Building2,
      iconBg: 'bg-cyan-500/10',
      iconColor: 'text-cyan-400',
      border: 'border-cyan-500/20',
    },
    {
      label: 'Active Dealers',
      value: stats.activeDealers,
      icon: TrendingUp,
      iconBg: 'bg-green-500/10',
      iconColor: 'text-green-400',
      border: 'border-green-500/20',
    },
    {
      label: 'Suspended Dealers',
      value: stats.suspendedDealers,
      icon: AlertCircle,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
      border: 'border-amber-500/20',
    },
    {
      label: 'Total Callers',
      value: stats.totalCallers,
      icon: Users,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-400',
      border: 'border-blue-500/20',
    },
  ];

  const planBadge: Record<string, string> = {
    basic: 'text-slate-300 bg-slate-700/60 border-slate-600/40',
    pro: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    enterprise: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
  };

  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-white">Founder Dashboard</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Welcome back, {profile?.full_name ?? 'Founder'} — here's your platform overview.
        </p>
      </motion.div>

      {/* Stats Grid */}
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
              className={`bg-slate-900/80 backdrop-blur border ${card.border} rounded-2xl p-5 flex items-center gap-4`}
            >
              <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{card.label}</p>
                {loading ? (
                  <div className="h-7 w-12 bg-slate-700/60 rounded animate-pulse mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-white mt-0.5">{card.value.toLocaleString()}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Recent Dealer Activity */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.4, ease: 'easeOut' }}
        className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Recent Dealer Activity</h2>
            <p className="text-slate-500 text-xs mt-0.5">Latest onboarded dealers and their status</p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-800/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : recentActivity.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No dealers found. Add your first dealer to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-6 py-3">Company</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-6 py-3">Owner</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-6 py-3">Plan</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-6 py-3">Callers</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-6 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map(({ dealer, callerCount }, i) => {
                  const status = statusConfig[dealer.subscription_status] ?? statusConfig.active;
                  return (
                    <motion.tr
                      key={dealer.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 + i * 0.05 }}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-cyan-400 text-xs font-bold">
                              {dealer.company_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm text-white font-medium">{dealer.company_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300">{dealer.owner_name}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-xs font-medium capitalize ${planBadge[dealer.subscription_plan] ?? planBadge.basic}`}>
                          {dealer.subscription_plan}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-medium ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-white font-medium">{callerCount}</span>
                        <span className="text-slate-500 text-xs ml-1">/ {dealer.max_callers}</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(dealer.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
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
