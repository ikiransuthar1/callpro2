import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import FounderDashboard from './pages/founder/FounderDashboard';
import DealerManagement from './pages/founder/DealerManagement';
import FounderAnalytics from './pages/founder/FounderAnalytics';
import DealerDashboard from './pages/dealer/DealerDashboard';
import CallerManagement from './pages/dealer/CallerManagement';
import LeadFiles from './pages/dealer/LeadFiles';
import DealerAnalytics from './pages/dealer/DealerAnalytics';
import CallerWorkspace from './pages/caller/CallerWorkspace';
import FollowUps from './pages/caller/FollowUps';
import type { UserRole } from './types/database';

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-[#080C14] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );
}

function RoleRouter() {
  const { profile, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!profile) return <Navigate to="/login" replace />;
  const home: Record<UserRole, string> = {
    founder: '/founder',
    dealer: '/dealer',
    caller: '/caller',
  };
  return <Navigate to={home[profile.role]} replace />;
}

function RequireAuth({ children, role }: { children: React.ReactNode; role: UserRole }) {
  const { profile, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role !== role) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RoleRouter />} />

          {/* Founder */}
          <Route path="/founder" element={<RequireAuth role="founder"><FounderDashboard /></RequireAuth>} />
          <Route path="/founder/dealers" element={<RequireAuth role="founder"><DealerManagement /></RequireAuth>} />
          <Route path="/founder/analytics" element={<RequireAuth role="founder"><FounderAnalytics /></RequireAuth>} />

          {/* Dealer */}
          <Route path="/dealer" element={<RequireAuth role="dealer"><DealerDashboard /></RequireAuth>} />
          <Route path="/dealer/callers" element={<RequireAuth role="dealer"><CallerManagement /></RequireAuth>} />
          <Route path="/dealer/files" element={<RequireAuth role="dealer"><LeadFiles /></RequireAuth>} />
          <Route path="/dealer/analytics" element={<RequireAuth role="dealer"><DealerAnalytics /></RequireAuth>} />

          {/* Caller */}
          <Route path="/caller" element={<RequireAuth role="caller"><CallerWorkspace /></RequireAuth>} />
          <Route path="/caller/followups" element={<RequireAuth role="caller"><FollowUps /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
