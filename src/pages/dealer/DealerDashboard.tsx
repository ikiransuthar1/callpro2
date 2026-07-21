import { useEffect, useState } from 'react'
import { Users, FileText, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function DealerDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ leads: 0, files: 0, callers: 0 })

  useEffect(() => {
    if (!profile?.dealer_id) return
    Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('dealer_id', profile.dealer_id),
      supabase.from('lead_files').select('id', { count: 'exact', head: true }).eq('dealer_id', profile.dealer_id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('dealer_id', profile.dealer_id).eq('role', 'caller'),
    ]).then(([l, f, c]) => setStats({ leads: l.count ?? 0, files: f.count ?? 0, callers: c.count ?? 0 }))
  }, [profile?.dealer_id])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: <FileText className="text-blue-600" size={24} />, label: 'Lead Files', value: stats.files },
          { icon: <Phone className="text-green-600" size={24} />, label: 'Total Leads', value: stats.leads },
          { icon: <Users className="text-purple-600" size={24} />, label: 'Callers', value: stats.callers },
        ].map(({ icon, label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm">
            <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
            <div><p className="text-2xl font-bold text-gray-900">{value}</p><p className="text-sm text-gray-500">{label}</p></div>
          </div>
        ))}
      </div>
    </div>
  )
}
