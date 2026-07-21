import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import DealerLayout from './pages/dealer/DealerLayout'
import DealerDashboard from './pages/dealer/DealerDashboard'
import LeadFiles from './pages/dealer/LeadFiles'
import CallerManagement from './pages/dealer/CallerManagement'
import CallerLayout from './pages/caller/CallerLayout'
import CallerWorkspace from './pages/caller/CallerWorkspace'
import FounderLayout from './pages/founder/FounderLayout'
import FounderDashboard from './pages/founder/FounderDashboard'

function RoleRouter() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'founder') return <Navigate to="/founder" replace />
  if (profile.role === 'dealer') return <Navigate to="/dealer" replace />
  if (profile.role === 'caller') return <Navigate to="/caller" replace />
  return <Navigate to="/login" replace />
}

function RequireAuth({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (!profile) return <Navigate to="/login" replace />
  if (!roles.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleRouter />} />
          <Route path="/dealer" element={<RequireAuth roles={['dealer']}><DealerLayout /></RequireAuth>}>
            <Route index element={<DealerDashboard />} />
            <Route path="files" element={<LeadFiles />} />
            <Route path="callers" element={<CallerManagement />} />
          </Route>
          <Route path="/caller" element={<RequireAuth roles={['caller']}><CallerLayout /></RequireAuth>}>
            <Route index element={<CallerWorkspace />} />
          </Route>
          <Route path="/founder" element={<RequireAuth roles={['founder']}><FounderLayout /></RequireAuth>}>
            <Route index element={<FounderDashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
