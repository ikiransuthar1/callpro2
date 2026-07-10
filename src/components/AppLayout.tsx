import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, LogOut, ChevronLeft, ChevronRight, LayoutDashboard,
  Users, BarChart3, Upload, PhoneCall, Calendar, Building2, Settings
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
}

const founderNav: NavItem[] = [
  { to: '/founder', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/founder/dealers', icon: Building2, label: 'Dealers' },
  { to: '/founder/analytics', icon: BarChart3, label: 'Analytics' },
];

const dealerNav: NavItem[] = [
  { to: '/dealer', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/dealer/callers', icon: Users, label: 'Callers' },
  { to: '/dealer/files', icon: Upload, label: 'Lead Files' },
  { to: '/dealer/analytics', icon: BarChart3, label: 'Analytics' },
];

const callerNav: NavItem[] = [
  { to: '/caller', icon: PhoneCall, label: 'Workspace' },
  { to: '/caller/followups', icon: Calendar, label: 'Follow-ups' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const navItems = profile?.role === 'founder' ? founderNav
    : profile?.role === 'dealer' ? dealerNav
    : callerNav;

  const roleLabel = profile?.role === 'founder' ? 'Founder' : profile?.role === 'dealer' ? 'Dealer' : 'Caller';
  const roleBadgeColor = profile?.role === 'founder'
    ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
    : profile?.role === 'dealer'
    ? 'bg-blue-400/10 text-blue-400 border-blue-400/20'
    : 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
    toast.success('Signed out successfully');
  };

  return (
    <div className="min-h-screen bg-[#080C14] flex">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="relative flex flex-col bg-slate-900/80 backdrop-blur border-r border-white/[0.06] shrink-0 h-screen sticky top-0"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/[0.06]">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-cyan-400/20 rounded-lg blur-sm" />
            <div className="relative w-9 h-9 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center">
              <Phone className="w-4 h-4 text-white" />
            </div>
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="text-lg font-bold text-white tracking-tight whitespace-nowrap"
              >
                CallPro
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split('/').length <= 2}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-cyan-400 rounded-r"
                    />
                  )}
                  <item.icon className="w-4 h-4 shrink-0" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-sm font-medium whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Profile + Signout */}
        <div className="border-t border-white/[0.06] p-3 space-y-2">
          <div className={`flex items-center gap-3 px-2 py-2 rounded-xl ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {profile?.full_name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-xs font-medium text-white truncate">
                    {profile?.full_name || profile?.email?.split('@')[0]}
                  </p>
                  <span className={`inline-block text-[10px] font-medium border px-1.5 py-0.5 rounded-full mt-0.5 ${roleBadgeColor}`}>
                    {roleLabel}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={handleSignOut}
            className={`flex items-center gap-3 w-full px-2 py-2 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-medium"
                >
                  Sign Out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="absolute -right-3 top-20 w-6 h-6 bg-slate-800 border border-white/[0.1] rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors z-10"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </motion.aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
