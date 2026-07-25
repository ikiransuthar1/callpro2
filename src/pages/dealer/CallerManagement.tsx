import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Plus, X, MoreVertical, Trash2, KeyRound, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile } from '../../types/database';

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function CallerManagement() {
  const { profile } = useAuth();
  const [callers, setCallers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(generatePassword());
  const [name, setName] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    if (!profile?.dealer_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('dealer_id', profile.dealer_id)
      .eq('role', 'caller')
      .order('created_at', { ascending: false });
    setCallers((data as Profile[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [profile?.dealer_id]);

  async function addCaller(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.dealer_id || !email || !password || !name) {
      toast.error('Please fill in all fields');
      return;
    }
    setCreating(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name, role: 'caller', dealer_id: profile.dealer_id } },
      });
      if (authError) throw authError;
      if (authData.user) {
        await supabase.from('profiles').upsert({
          id: authData.user.id, email, full_name: name, role: 'caller',
          dealer_id: profile.dealer_id, status: 'active',
        });
      }
      toast.success(`Caller "${name}" created. Temp password: ${password}`);
      setEmail(''); setPassword(generatePassword()); setName(''); setShowForm(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create caller');
    } finally {
      setCreating(false);
    }
  }

  async function resetPassword(callerEmail: string) {
    setOpenMenuId(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(callerEmail, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${callerEmail}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  return (
    <div className="min-h-screen bg-[#080C14] p-8" onClick={() => setOpenMenuId(null)}>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between mb-8 flex-wrap gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Callers</h1>
          <p className="text-slate-400 mt-1 text-sm">Manage caller accounts for your dealership</p>
        </div>
        <button
          onClick={() => { setPassword(generatePassword()); setShowForm(true); }}
          className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium px-4 py-2 rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all text-sm"
        >
          <Plus size={16} /> Add Caller
        </button>
      </motion.div>

      <div className="max-w-2xl mx-auto space-y-3">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/40 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && callers.length === 0 && (
          <div className="bg-slate-900/60 border border-white/[0.06] rounded-2xl p-14 text-center">
            <User className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No callers yet. Add your first caller to start making calls.</p>
          </div>
        )}

        {callers.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-cyan-500/10 border border-cyan-500/20 rounded-full flex items-center justify-center shrink-0">
              <span className="text-cyan-400 text-sm font-bold">
                {(c.full_name ?? c.email ?? 'U')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white truncate">{c.full_name || 'Unnamed'}</p>
              <p className="text-sm text-slate-500 truncate">{c.email}</p>
            </div>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
              >
                <MoreVertical size={16} />
              </button>
              <AnimatePresence>
                {openMenuId === c.id && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    className="absolute right-0 top-9 z-20 w-44 bg-slate-800 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
                  >
                    <button
                      onClick={() => resetPassword(c.email ?? '')}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                    >
                      <KeyRound size={14} className="text-blue-400" /> Reset Password
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create Caller Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-slate-900 border border-white/[0.08] rounded-2xl w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
                <h2 className="text-base font-semibold text-white">Add New Caller</h2>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={addCaller} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input
                    value={name} onChange={(e) => setName(e.target.value)} required
                    placeholder="John Doe"
                    className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Email <span className="text-red-400">*</span></label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                    placeholder="caller@company.com"
                    className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Temporary Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'} value={password}
                      onChange={(e) => setPassword(e.target.value)} required
                      className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none pr-20 font-mono"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button type="button" onClick={() => setShowPwd(!showPwd)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 transition-colors">
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button type="button" onClick={() => setPassword(generatePassword())} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-cyan-400 transition-colors">
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5">Save this password — share it with the caller.</p>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all">Cancel</button>
                  <button type="submit" disabled={creating} className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium px-5 py-2 rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all text-sm disabled:opacity-60">
                    {creating ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> : <><Plus size={14} /> Create Caller</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
