import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, FileText, Users, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function DealerLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-100">
          <h1 className="font-bold text-gray-900 text-lg">LeadLoom</h1>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{profile?.email}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { to: '/dealer', end: true, icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
            { to: '/dealer/files', icon: <FileText size={16} />, label: 'Lead Files' },
            { to: '/dealer/callers', icon: <Users size={16} />, label: 'Callers' },
          ].map(({ to, end, icon, label }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`
            }>{icon}{label}</NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button onClick={async () => { await signOut(); navigate('/login') }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 w-full rounded-lg hover:bg-gray-50">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  )
}
