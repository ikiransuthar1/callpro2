import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  ShieldOff,
  ShieldCheck,
  KeyRound,
  Download,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Dealer, SubscriptionPlan, SubscriptionStatus } from '../../types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DealerRow extends Dealer {
  callerCount: number;
}

interface NewDealerForm {
  company_name: string;
  owner_name: string;
  email: string;
  phone: string;
  subscription_plan: SubscriptionPlan;
  max_callers: number;
  password: string;
}

interface EditPlanForm {
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  max_callers: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const planBadge: Record<SubscriptionPlan, string> = {
  basic: 'text-slate-300 bg-slate-700/60 border-slate-600/40',
  pro: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  enterprise: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
};

const statusBadge: Record<SubscriptionStatus, string> = {
  active: 'text-green-400 bg-green-500/10 border-green-500/20',
  suspended: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  cancelled: 'text-red-400 bg-red-500/10 border-red-500/20',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function InputField({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        {...props}
        className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none placeholder:text-slate-600 transition-colors"
      />
    </div>
  );
}

function SelectField({
  label,
  required,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        <select
          {...props}
          className="w-full appearance-none bg-slate-800/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none transition-colors pr-10"
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DealerManagement() {
  const { user } = useAuth();
  const [dealers, setDealers] = useState<DealerRow[]>([]);
  const [filtered, setFiltered] = useState<DealerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<DealerRow | null>(null);
  const [showDelete, setShowDelete] = useState<DealerRow | null>(null);
  const [showResetPwd, setShowResetPwd] = useState<DealerRow | null>(null);

  // Create form
  const defaultForm: NewDealerForm = {
    company_name: '',
    owner_name: '',
    email: '',
    phone: '',
    subscription_plan: 'basic',
    max_callers: 5,
    password: generatePassword(),
  };
  const [form, setForm] = useState<NewDealerForm>(defaultForm);
  const [showPwd, setShowPwd] = useState(false);
  const [creating, setCreating] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState<EditPlanForm>({
    subscription_plan: 'basic',
    subscription_status: 'active',
    max_callers: 5,
  });
  const [saving, setSaving] = useState(false);

  // Reset password
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [resetting, setResetting] = useState(false);

  // ─── Data ──────────────────────────────────────────────────────────────────

  const fetchDealers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: dealerData, error: dealerError } = await supabase
        .from('dealers')
        .select('*')
        .order('created_at', { ascending: false });

      if (dealerError) throw dealerError;

      const { data: callerData, error: callerError } = await supabase
        .from('profiles')
        .select('dealer_id')
        .eq('role', 'caller');

      if (callerError) throw callerError;

      const callerCountMap: Record<string, number> = {};
      for (const p of callerData ?? []) {
        if (p.dealer_id) callerCountMap[p.dealer_id] = (callerCountMap[p.dealer_id] ?? 0) + 1;
      }

      const rows: DealerRow[] = (dealerData ?? []).map((d) => ({
        ...d,
        callerCount: callerCountMap[d.id] ?? 0,
      }));

      setDealers(rows);
      setFiltered(rows);
    } catch (err: unknown) {
      toast.error('Failed to load dealers');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDealers();
  }, [fetchDealers]);

  useEffect(() => {
    const q = search.toLowerCase();
    if (!q) {
      setFiltered(dealers);
    } else {
      setFiltered(
        dealers.filter(
          (d) =>
            d.company_name.toLowerCase().includes(q) ||
            d.owner_name.toLowerCase().includes(q) ||
            d.email.toLowerCase().includes(q),
        ),
      );
    }
  }, [search, dealers]);

  // ─── Create Dealer ─────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name || !form.owner_name || !form.email || !form.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    setCreating(true);
    try {
      // 1. Insert dealer record first
      const { data: dealerData, error: dealerError } = await supabase
        .from('dealers')
        .insert({
          company_name: form.company_name,
          owner_name: form.owner_name,
          email: form.email,
          phone: form.phone || null,
          subscription_plan: form.subscription_plan,
          subscription_status: 'active' as SubscriptionStatus,
          max_callers: form.max_callers,
          created_by: user?.id ?? null,
        })
        .select()
        .single();

      if (dealerError) throw dealerError;

      // 2. Create auth user via signUp (uses public anon key — dealer logs in themselves later)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.owner_name,
            role: 'dealer',
          },
        },
      });

      if (authError) {
        // Rollback dealer record
        await supabase.from('dealers').delete().eq('id', dealerData.id);
        throw authError;
      }

      if (authData.user) {
        // 3. Insert profile row
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          email: form.email,
          full_name: form.owner_name,
          role: 'dealer',
          dealer_id: dealerData.id,
          status: 'active',
        });

        if (profileError) {
          console.warn('Profile upsert failed:', profileError.message);
        }

        // 4. Update dealer with owner user id link
        await supabase.from('dealers').update({ created_by: authData.user.id }).eq('id', dealerData.id);
      }

      toast.success(`Dealer "${form.company_name}" created! Temp password: ${form.password}`);
      setShowCreate(false);
      setForm({ ...defaultForm, password: generatePassword() });
      fetchDealers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create dealer';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  // ─── Edit / Update ─────────────────────────────────────────────────────────

  const openEdit = (dealer: DealerRow) => {
    setEditForm({
      subscription_plan: dealer.subscription_plan,
      subscription_status: dealer.subscription_status,
      max_callers: dealer.max_callers,
    });
    setShowEdit(dealer);
    setOpenMenuId(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEdit) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('dealers')
        .update({
          subscription_plan: editForm.subscription_plan,
          subscription_status: editForm.subscription_status,
          max_callers: editForm.max_callers,
        })
        .eq('id', showEdit.id);

      if (error) throw error;
      toast.success('Dealer updated successfully');
      setShowEdit(null);
      fetchDealers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  // ─── Block / Unblock ───────────────────────────────────────────────────────

  const handleToggleStatus = async (dealer: DealerRow) => {
    setOpenMenuId(null);
    const newStatus: SubscriptionStatus =
      dealer.subscription_status === 'suspended' ? 'active' : 'suspended';
    try {
      const { error } = await supabase
        .from('dealers')
        .update({ subscription_status: newStatus })
        .eq('id', dealer.id);
      if (error) throw error;
      toast.success(
        newStatus === 'suspended'
          ? `${dealer.company_name} suspended`
          : `${dealer.company_name} reactivated`,
      );
      fetchDealers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Status change failed');
    }
  };

  // ─── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!showDelete) return;
    try {
      const { error } = await supabase.from('dealers').delete().eq('id', showDelete.id);
      if (error) throw error;
      toast.success(`${showDelete.company_name} deleted`);
      setShowDelete(null);
      fetchDealers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  // ─── Reset Password ────────────────────────────────────────────────────────

  const handleResetPassword = async () => {
    if (!showResetPwd) return;
    setResetting(true);
    try {
      // Trigger a password reset email via Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(showResetPwd.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${showResetPwd.email}`);
      setShowResetPwd(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  // ─── Export ────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const rows = filtered.map((d) => ({
      'Company Name': d.company_name,
      'Owner Name': d.owner_name,
      Email: d.email,
      Phone: d.phone ?? '',
      Plan: d.subscription_plan,
      Status: d.subscription_status,
      'Max Callers': d.max_callers,
      'Active Callers': d.callerCount,
      'Created At': new Date(d.created_at).toLocaleDateString(),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dealers');
    XLSX.writeFile(wb, `dealers_export_${Date.now()}.xlsx`);
    toast.success('Excel file downloaded');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080C14] p-8" onClick={() => setOpenMenuId(null)}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Dealer Management</h1>
          <p className="text-slate-400 mt-1 text-sm">Create, manage and monitor all dealer accounts</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 border border-white/[0.08] text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-all"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={() => { setForm({ ...defaultForm, password: generatePassword() }); setShowCreate(true); }}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium px-4 py-2 rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all text-sm"
          >
            <Plus className="w-4 h-4" />
            New Dealer
          </button>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="relative mb-5 max-w-sm"
      >
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company, owner or email…"
          className="w-full bg-slate-900/80 border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none placeholder:text-slate-600"
        />
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="bg-slate-900/60 rounded-2xl border border-white/[0.06] overflow-hidden"
      >
        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              {search ? 'No dealers match your search.' : 'No dealers yet. Create the first one!'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  {['Company', 'Owner', 'Email', 'Plan', 'Status', 'Callers', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3.5"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((dealer) => (
                  <tr
                    key={dealer.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Company */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-cyan-400 text-xs font-bold">
                            {dealer.company_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm text-white font-medium">{dealer.company_name}</span>
                      </div>
                    </td>
                    {/* Owner */}
                    <td className="px-5 py-4 text-sm text-slate-300">{dealer.owner_name}</td>
                    {/* Email */}
                    <td className="px-5 py-4 text-sm text-slate-400">{dealer.email}</td>
                    {/* Plan */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-xs font-medium capitalize ${planBadge[dealer.subscription_plan]}`}>
                        {dealer.subscription_plan}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-xs font-medium capitalize ${statusBadge[dealer.subscription_status]}`}>
                        {dealer.subscription_status}
                      </span>
                    </td>
                    {/* Callers */}
                    <td className="px-5 py-4 text-sm text-white font-medium">
                      {dealer.callerCount}
                      <span className="text-slate-500 text-xs ml-1">/ {dealer.max_callers}</span>
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === dealer.id ? null : dealer.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        <AnimatePresence>
                          {openMenuId === dealer.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }}
                              transition={{ duration: 0.12 }}
                              className="absolute right-0 top-9 z-20 w-52 bg-slate-800 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
                            >
                              <button
                                onClick={() => openEdit(dealer)}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                              >
                                <Edit2 className="w-4 h-4 text-cyan-400" />
                                Edit Plan / Status
                              </button>
                              <button
                                onClick={() => handleToggleStatus(dealer)}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                              >
                                {dealer.subscription_status === 'suspended' ? (
                                  <>
                                    <ShieldCheck className="w-4 h-4 text-green-400" />
                                    Unblock Dealer
                                  </>
                                ) : (
                                  <>
                                    <ShieldOff className="w-4 h-4 text-amber-400" />
                                    Block / Suspend
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => { setShowResetPwd(dealer); setNewPassword(generatePassword()); setOpenMenuId(null); }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left"
                              >
                                <KeyRound className="w-4 h-4 text-blue-400" />
                                Reset Password
                              </button>
                              <div className="border-t border-white/[0.06]" />
                              <button
                                onClick={() => { setShowDelete(dealer); setOpenMenuId(null); }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete Dealer
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-white/[0.05] flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {filtered.length} of {dealers.length} dealers
            </p>
            <button
              onClick={fetchDealers}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        )}
      </motion.div>

      {/* ── Create Dealer Modal ─────────────────────────────────────────────── */}
      {showCreate && (
        <ModalOverlay onClose={() => setShowCreate(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900 border border-white/[0.08] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <div>
                <h2 className="text-base font-semibold text-white">Create New Dealer</h2>
                <p className="text-slate-500 text-xs mt-0.5">Set up a new dealer account on the platform</p>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InputField
                  label="Company Name"
                  required
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  placeholder="Apex Auto Dealers"
                />
                <InputField
                  label="Owner Name"
                  required
                  value={form.owner_name}
                  onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                  placeholder="John Smith"
                />
              </div>

              <InputField
                label="Email Address"
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john@apexauto.com"
              />

              <InputField
                label="Phone Number"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
              />

              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="Subscription Plan"
                  required
                  value={form.subscription_plan}
                  onChange={(e) => setForm({ ...form, subscription_plan: e.target.value as SubscriptionPlan })}
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </SelectField>

                <InputField
                  label="Max Callers"
                  required
                  type="number"
                  min={1}
                  max={500}
                  value={form.max_callers}
                  onChange={(e) => setForm({ ...form, max_callers: Number(e.target.value) })}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Temporary Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none pr-20 font-mono"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 transition-colors"
                    >
                      {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, password: generatePassword() })}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-cyan-400 transition-colors"
                      title="Regenerate password"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1.5">
                  Save this password — you won't be able to see it again once the dealer is created.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium px-5 py-2 rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Dealer
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </ModalOverlay>
      )}

      {/* ── Edit Plan Modal ─────────────────────────────────────────────────── */}
      {showEdit && (
        <ModalOverlay onClose={() => setShowEdit(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900 border border-white/[0.08] rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <div>
                <h2 className="text-base font-semibold text-white">Edit Dealer</h2>
                <p className="text-slate-500 text-xs mt-0.5">{showEdit.company_name}</p>
              </div>
              <button onClick={() => setShowEdit(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="Subscription Plan"
                  value={editForm.subscription_plan}
                  onChange={(e) => setEditForm({ ...editForm, subscription_plan: e.target.value as SubscriptionPlan })}
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </SelectField>
                <SelectField
                  label="Status"
                  value={editForm.subscription_status}
                  onChange={(e) => setEditForm({ ...editForm, subscription_status: e.target.value as SubscriptionStatus })}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </SelectField>
              </div>
              <InputField
                label="Max Callers"
                type="number"
                min={1}
                max={500}
                value={editForm.max_callers}
                onChange={(e) => setEditForm({ ...editForm, max_callers: Number(e.target.value) })}
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowEdit(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium px-5 py-2 rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all text-sm disabled:opacity-60"
                >
                  {saving ? <><RefreshCw className="w-4 h-4 animate-spin" />Saving…</> : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </ModalOverlay>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      {showDelete && (
        <ModalOverlay onClose={() => setShowDelete(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900 border border-white/[0.08] rounded-2xl w-full max-w-sm shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-base font-semibold text-white text-center">Delete Dealer?</h2>
            <p className="text-slate-400 text-sm text-center mt-2">
              Are you sure you want to permanently delete <span className="text-white font-medium">{showDelete.company_name}</span>? This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <button onClick={() => setShowDelete(null)} className="flex-1 px-4 py-2.5 text-sm text-slate-400 hover:text-white border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500/80 hover:bg-red-500 text-white rounded-xl transition-all"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </ModalOverlay>
      )}

      {/* ── Reset Password Modal ────────────────────────────────────────────── */}
      {showResetPwd && (
        <ModalOverlay onClose={() => setShowResetPwd(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900 border border-white/[0.08] rounded-2xl w-full max-w-sm shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-white text-center">Reset Password</h2>
            <p className="text-slate-400 text-sm text-center mt-2">
              Send a password reset link to <span className="text-white font-medium">{showResetPwd.email}</span>. They'll receive an email to set a new password.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">New Temporary Password (optional reference)</label>
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none pr-20 font-mono"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 transition-colors">
                    {showNewPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button type="button" onClick={() => setNewPassword(generatePassword())} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-cyan-400 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-5">
              <button onClick={() => setShowResetPwd(null)} className="flex-1 px-4 py-2.5 text-sm text-slate-400 hover:text-white border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition-all">
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl hover:shadow-lg hover:shadow-cyan-500/20 transition-all disabled:opacity-60"
              >
                {resetting ? <><RefreshCw className="w-4 h-4 animate-spin" />Sending…</> : 'Send Reset Email'}
              </button>
            </div>
          </motion.div>
        </ModalOverlay>
      )}
    </div>
  );
}
