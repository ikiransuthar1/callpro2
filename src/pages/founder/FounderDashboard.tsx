import { useEffect, useState } from 'react'
import { supabase, Dealer } from '../../lib/supabase'

export default function FounderDashboard() {
  const [dealers, setDealers] = useState<Dealer[]>([])
  useEffect(() => {
    supabase.from('dealers').select('*').order('created_at', { ascending: false }).then(({ data }) => setDealers(data ?? []))
  }, [])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">All Dealers</h1>
      <div className="space-y-3">
        {dealers.map((d) => (
          <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{d.company_name}</p>
              <p className="text-sm text-gray-500">{d.email} · {d.subscription_plan}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${d.subscription_status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {d.subscription_status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
