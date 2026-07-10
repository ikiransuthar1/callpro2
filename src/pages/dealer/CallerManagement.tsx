import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Lock,
  Trash2,
  ShieldOff,
  ShieldCheck,
  X,
  Eye,
  EyeOff,
  Mail,
  Copy,
  Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Profile } from '../../types/database';
import toast from 'react-hot-toast';

/* ─── Modal backdrop animation ─────────────────────────────────────────── */
const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};
const modalVariants = {
  hidden: { opacity: 0, scale: 0.94, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.94, y: 16, transition: { duration: 0.18 } },
};

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface AddCallerForm {
  fullName: string;
  email: string;
  password: string;
}

interface CreatedCaller {
  email: string;
  password: string;
  fullName: string;
}

type ModalType = 'add' | 'resetPassword' | 'delete' | 'createdSuccess' | null;

export default function CallerManagement() {
  const { profile } = useAuth();
  const dealerId = profile?.dealer_id ?? profile?.id;

  const [callers, setCallers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [modal, setModal] = useState<ModalType>(null);
  const [selectedCaller, setSelectedCaller] = useState<Profile | null>(null);
  const [createdCaller, setCreatedCaller] = useState<CreatedCaller | null>(null);
  const [copied, setCopied] = useState(false);

  // Add caller form
  const [form, setForm] = useState<AddCallerForm>({ fullName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  // Reset password
  const [resetEmail, setResetEmail] = useState('');

  /* ─── Fetch callers ─────────────────────────────────────────────────── */
  const fetchCallers = useCallback(async () => {
    if (!dealerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'caller')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });

    if (error) toast.error(error.message);
    else setCallers(data ?? []);
    setLoading(false);
  }, [dealerId]);

  useEffect(() => {
    fetchCallers();
  }, [fetchCallers]);

  /* ─── Add caller ────────────────────────────────────────────────────── */
  async function handleAddCaller() {
    if (!form.fullName.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('All fields are required');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: { full_name: form.fullName.trim() },
        },
      });

      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error('No user returned from sign up');

      const newUserId = signUpData.user.id;

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: newUserId,
        email: form.email.trim().toLowerCase(),
        full_name: form.fullName.trim(),
        role: 'caller' as const,
        dealer_id: dealerId!,
        status: 'active' as const,
      });

      if (profileError) throw profileError;

      setCreatedCaller({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        fullName: form.fullName.trim(),
      });
      setForm({ fullName: '', email: '', password: '' });
      setModal('createdSuccess');
      await fetchCallers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create caller';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  /* ─── Block / Unblock ───────────────────────────────────────────────── */
  async function handleToggleBlock(caller: Profile) {
    const newStatus = caller.status === 'active' ? 'blocked' : 'active';
    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', caller.id);

    if (error) toast.error(error.message);
    else {
      toast.success(`Caller ${newStatus === 'blocked' ? 'blocked' : 'unblocked'}`);
      setCallers((prev) =>
        prev.map((c) => (c.id === caller.id ? { ...c, status: newStatus } : c))
      );
    }
  }

  /* ─── Reset password (send email) ──────────────────────────────────── */
  async function handleResetPassword() {
    if (!resetEmail) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Password reset email sent to ' + resetEmail);
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  /* ─── Delete caller ─────────────────────────────────────────────────── */
  async function handleDeleteCaller() {
    if (!selectedCaller) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', selectedCaller.id);

      if (error) throw error;
      toast.success('Caller removed');
      setCallers((prev) => prev.filter((c) => c.id !== selectedCaller.id));
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete caller';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function openResetModal(caller: Profile) {
    setSelectedCaller(caller);
    setResetEmail(caller.email);
    setModal('resetPassword');
  }

  function openDeleteModal(caller: Profile) {
    setSelectedCaller(caller);
    setModal('delete');
  }

  function closeModal() {
    setModal(null);
    setSelectedCaller(null);
    setCreatedCaller(null);
    setResetEmail('');
    setShowPassword(false);
    setCopied(false);
  }

  function copyPassword(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  /* ─── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#080C14] p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Caller Management</h1>
          <p className="text-slate-400 mt-1 text-sm">
            {callers.length} caller{callers.length !== 1 ? 's' : ''} in your team
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 transition-colors text-[#080C14] font-semibold px-5 py-2.5 rounded-xl text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add Caller
        </button>
      </motion.div>

      {/* Callers Table */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="bg-slate-900/80 backdrop-blur border border-white/[0.08] rounded-2xl overflow-hidden"
      >
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : callers.length === 0 ? (
          <div className="p-14 text-center">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">No callers added yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Click "Add Caller" to onboard your first team member
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Caller
                  </th>
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Status
                  </th>
                  <th className="text-left text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Joined
                  </th>
                  <th className="text-right text-slate-400 font-medium px-6 py-3 uppercase text-xs tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {callers.map((caller, i) => (
                  <motion.tr
                    key={caller.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.05, duration: 0.3 }}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-cyan-400/10 flex items-center justify-center shrink-0">
                          <span className="text-cyan-400 text-sm font-bold">
                            {(caller.full_name ?? caller.email).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{caller.full_name ?? '—'}</p>
                          <p className="text-slate-500 text-xs">{caller.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                          caller.status === 'active'
                            ? 'bg-emerald-400/10 text-emerald-400'
                            : 'bg-red-400/10 text-red-400'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            caller.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'
                          }`}
                        />
                        {caller.status === 'active' ? 'Active' : 'Blocked'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {new Date(caller.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Block/Unblock */}
                        <button
                          onClick={() => handleToggleBlock(caller)}
                          title={caller.status === 'active' ? 'Block caller' : 'Unblock caller'}
                          className={`p-2 rounded-lg transition-colors ${
                            caller.status === 'active'
                              ? 'text-slate-400 hover:text-red-400 hover:bg-red-400/10'
                              : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10'
                          }`}
                        >
                          {caller.status === 'active' ? (
                            <ShieldOff className="w-4 h-4" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                        </button>

                        {/* Reset password */}
                        <button
                          onClick={() => openResetModal(caller)}
                          title="Send password reset"
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                        >
                          <Lock className="w-4 h-4" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => openDeleteModal(caller)}
                          title="Delete caller"
                          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ── MODALS ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {/* Add Caller Modal */}
        {modal === 'add' && (
          <motion.div
            key="add-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <motion.div
              key="add-modal"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-slate-900 border border-white/[0.1] rounded-2xl w-full max-w-md p-7 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Add New Caller</h2>
                  <p className="text-slate-400 text-sm mt-0.5">
                    Create login credentials for your caller
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    placeholder="Jane Doe"
                    className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="caller@example.com"
                    className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="Min. 8 characters"
                      className="w-full bg-slate-800 border border-white/[0.08] rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-slate-500 text-xs mt-1.5">
                    You set this password. Share it securely with the caller.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-7">
                <button
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.05] transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCaller}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#080C14] font-semibold transition text-sm"
                >
                  {submitting ? 'Creating…' : 'Create Caller'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Created Success Modal */}
        {modal === 'createdSuccess' && createdCaller && (
          <motion.div
            key="success-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              key="success-modal"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-slate-900 border border-white/[0.1] rounded-2xl w-full max-w-md p-7 shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Caller Created!</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Share these credentials securely with your caller.
                </p>
              </div>

              <div className="bg-slate-800/60 rounded-xl p-4 space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Name</span>
                  <span className="text-white font-medium text-sm">{createdCaller.fullName}</span>
                </div>
                <div className="border-t border-white/[0.06]" />
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Email</span>
                  <span className="text-white font-medium text-sm">{createdCaller.email}</span>
                </div>
                <div className="border-t border-white/[0.06]" />
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Password</span>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-mono text-sm">{createdCaller.password}</span>
                    <button
                      onClick={() => copyPassword(createdCaller.password)}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-amber-400/80 text-xs text-center mb-5">
                ⚠️ This password will not be shown again. Copy it now.
              </p>

              <button
                onClick={closeModal}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#080C14] font-semibold transition text-sm"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Reset Password Modal */}
        {modal === 'resetPassword' && selectedCaller && (
          <motion.div
            key="reset-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <motion.div
              key="reset-modal"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-slate-900 border border-white/[0.1] rounded-2xl w-full max-w-md p-7 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Reset Password</h2>
                  <p className="text-slate-400 text-sm mt-0.5">
                    Send a reset link to the caller's email
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-800/60 rounded-xl p-4 flex items-center gap-3 mb-6">
                <Mail className="w-5 h-5 text-blue-400 shrink-0" />
                <div>
                  <p className="text-slate-300 text-sm font-medium">
                    {selectedCaller.full_name ?? selectedCaller.email}
                  </p>
                  <p className="text-slate-500 text-xs">{selectedCaller.email}</p>
                </div>
              </div>

              <p className="text-slate-400 text-sm mb-6">
                A password reset link will be sent to{' '}
                <span className="text-cyan-400 font-medium">{selectedCaller.email}</span>. The
                caller must click the link to set a new password.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.05] transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition text-sm"
                >
                  {submitting ? 'Sending…' : 'Send Reset Email'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Delete Confirmation Modal */}
        {modal === 'delete' && selectedCaller && (
          <motion.div
            key="delete-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <motion.div
              key="delete-modal"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="bg-slate-900 border border-white/[0.1] rounded-2xl w-full max-w-md p-7 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-white">Remove Caller</h2>
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-slate-300 text-sm mb-2">
                Are you sure you want to remove{' '}
                <span className="text-white font-semibold">
                  {selectedCaller.full_name ?? selectedCaller.email}
                </span>{' '}
                from your team?
              </p>
              <p className="text-slate-500 text-xs mb-7">
                This removes their profile record. Their call history will be preserved. This
                action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.05] transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCaller}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition text-sm"
                >
                  {submitting ? 'Removing…' : 'Remove Caller'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
