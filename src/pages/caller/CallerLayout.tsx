import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function CallerLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="font-bold text-gray-900 text-sm">LeadLoom Caller</h1>
          <p className="text-xs text-gray-500 truncate max-w-48">{profile?.full_name || profile?.email}</p>
        </div>
        <button onClick={async () => { await signOut(); navigate('/login') }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-50">
          <LogOut size={15} /> Sign Out
        </button>
      </header>
      <Outlet />
    </div>
  )
}
