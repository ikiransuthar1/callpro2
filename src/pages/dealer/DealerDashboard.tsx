import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Phone, Users, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Stats {
  leads: number;
  pending: number;
  files: number;
  callers: number;
  callsToday: number;
  interested: number;
}

export default function DealerDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({ leads: 0, pending: 0, files: 0, callers: 0, callsToday: 0, interested: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.dealer_id) return;
    (async () => {
      const dealerId = profile.dealer_id!;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const [leads, pending, files, callers, callsToday, interested] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('dealer_id', dealerId),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('dealer_id', dealerId).eq('status', 'pending'),
        supabase.from('lead_files').select('id', { count: 'exact', head: true }).eq('dealer_id', dealerId),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('dealer_id', dealerId).eq('role', 'caller'),
        supabase.from('call_logs').select('id', { count: 'exact', head: true }).eq('dealer_id', dealerId).gte('called_at', todayIso),
        supabase.from('call_logs').select('id', { count: 'exact', head: true }).eq('dealer_id', dealerId).eq('action', 'interested'),
      ]);

      setStats({
        leads: leads.count ?? 0,
        pending: pending.count ?? 0,
        files: files.count ?? 0,
        callers: callers.count ?? 0,
        callsToday: callsToday.count ?? 0,
        interested: interested.count ?? 0,
      });
      setLoading(false);
    })();
  }, [profile?.dealer_id]);

  const cards = [
    { label: 'Total Leads', value: stats.leads, icon: FileText, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { label: 'Pending', value: stats.pending, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { label: 'Lead Files', value: stats.files, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { label: 'Active Callers', value: stats.callers, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { label: 'Calls Today', value: stats.callsToday, icon: Phone, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { label: 'Interested', value: stats.interested, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  ];

  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1 text-sm">Overview of your lead-calling operations</p>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-5">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
              className={`bg-slate-900/80 backdrop-blur border ${card.border} rounded-2xl p-5`}
            >
              <div className={`${card.bg} rounded-xl p-2.5 w-fit mb-3`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              {loading ? (
                <div className="h-8 w-14 bg-slate-700/60 rounded animate-pulse" />
              ) : (
                <p className="text-white text-2xl font-bold">{card.value.toLocaleString()}</p>
              )}
              <p className="text-slate-400 text-xs font-medium mt-0.5">{card.label}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
