import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, Phone, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PlatformStats {
  dealers: number;
  callers: number;
  leads: number;
  calls: number;
}

export default function FounderDashboard() {
  const [stats, setStats] = useState<PlatformStats>({ dealers: 0, callers: 0, leads: 0, calls: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('dealers').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'caller'),
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      supabase.from('call_logs').select('id', { count: 'exact', head: true }),
    ]).then(([d, c, l, cl]) => {
      setStats({ dealers: d.count ?? 0, callers: c.count ?? 0, leads: l.count ?? 0, calls: cl.count ?? 0 });
      setLoading(false);
    });
  }, []);

  const cards = [
    { label: 'Total Dealers', value: stats.dealers, icon: Building2, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { label: 'Total Callers', value: stats.callers, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { label: 'Total Leads', value: stats.leads, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { label: 'Total Calls', value: stats.calls, icon: Phone, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  ];

  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-white">Founder Dashboard</h1>
        <p className="text-slate-400 mt-1 text-sm">Platform-wide overview</p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className={`bg-slate-900/80 backdrop-blur border ${card.border} rounded-2xl p-5 flex items-center gap-4`}
            >
              <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{card.label}</p>
                {loading ? (
                  <div className="h-7 w-14 bg-slate-700/60 rounded animate-pulse mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-white mt-0.5">{card.value.toLocaleString()}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
