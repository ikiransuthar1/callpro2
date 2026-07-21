import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function FounderLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-100"><h1 className="font-bold text-gray-900">Founder Panel</h1></div>
        <nav className="flex-1 p-3">
          <NavLink to="/founder" end className={({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button onClick={async () => { await signOut(); navigate('/login') }} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 w-full">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  )
}
