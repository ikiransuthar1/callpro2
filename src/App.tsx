import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import FounderDashboard from './pages/founder/FounderDashboard';
import DealerManagementFounder from './pages/founder/DealerManagement';
import FounderAnalytics from './pages/founder/FounderAnalytics';
import DealerDashboard from './pages/dealer/DealerDashboard';
import CallerManagement from './pages/dealer/CallerManagement';
import LeadFiles from './pages/dealer/LeadFiles';
import DealerAnalytics from './pages/dealer/DealerAnalytics';
import CallerWorkspace from './pages/caller/CallerWorkspace';
import FollowUps from './pages/caller/FollowUps';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#080C14] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading workspace...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.status === 'blocked') {
    return (
      <div className="min-h-screen bg-[#080C14] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-3xl">🚫</span>
          </div>
          <h2 className="text-xl font-bold text-white">Account Blocked</h2>
          <p className="text-slate-400 text-sm">Your account has been suspended. Contact your administrator.</p>
        </div>
      </div>
    );
  }
  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to={getDefaultRoute(profile.role)} replace />;
  }
  return <>{children}</>;
}

function getDefaultRoute(role: string) {
  switch (role) {
    case 'founder': return '/founder';
    case 'dealer': return '/dealer';
    case 'caller': return '/caller';
    default: return '/login';
  }
}

function RoleRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={getDefaultRoute(profile.role)} replace />;
}

export default function App() {
  const { user, profile, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={
        loading ? <LoadingScreen /> :
        user && profile ? <Navigate to={getDefaultRoute(profile.role)} replace /> :
        <LoginPage />
      } />

      {/* Founder routes */}
      <Route path="/founder" element={
        <ProtectedRoute roles={['founder']}>
          <AppLayout>
            <FounderDashboard />
          </AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/founder/dealers" element={
        <ProtectedRoute roles={['founder']}>
          <AppLayout>
            <DealerManagementFounder />
          </AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/founder/analytics" element={
        <ProtectedRoute roles={['founder']}>
          <AppLayout>
            <FounderAnalytics />
          </AppLayout>
        </ProtectedRoute>
      } />

      {/* Dealer routes */}
      <Route path="/dealer" element={
        <ProtectedRoute roles={['dealer']}>
          <AppLayout>
            <DealerDashboard />
          </AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/dealer/callers" element={
        <ProtectedRoute roles={['dealer']}>
          <AppLayout>
            <CallerManagement />
          </AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/dealer/files" element={
        <ProtectedRoute roles={['dealer']}>
          <AppLayout>
            <LeadFiles />
          </AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/dealer/analytics" element={
        <ProtectedRoute roles={['dealer']}>
          <AppLayout>
            <DealerAnalytics />
          </AppLayout>
        </ProtectedRoute>
      } />

      {/* Caller routes */}
      <Route path="/caller" element={
        <ProtectedRoute roles={['caller']}>
          <AppLayout>
            <CallerWorkspace />
          </AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/caller/followups" element={
        <ProtectedRoute roles={['caller']}>
          <AppLayout>
            <FollowUps />
          </AppLayout>
        </ProtectedRoute>
      } />

      {/* Default */}
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
