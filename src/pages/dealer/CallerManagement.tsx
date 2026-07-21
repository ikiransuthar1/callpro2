import { useEffect, useState } from 'react'
import { supabase, Profile } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { User, Plus } from 'lucide-react'

export default function CallerManagement() {
  const { profile } = useAuth()
  const [callers, setCallers] = useState<Profile[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function load() {
    if (!profile?.dealer_id) return
    const { data } = await supabase.from('profiles').select('*').eq('dealer_id', profile.dealer_id).eq('role', 'caller')
    setCallers(data ?? [])
  }

  useEffect(() => { load() }, [profile?.dealer_id])

  async function addCaller(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setError('')
    const { error: err } = await supabase.functions.invoke('create-caller', {
      body: { email, password, full_name: name, dealer_id: profile?.dealer_id },
    })
    if (err) setError('Failed to create caller.')
    else { setEmail(''); setPassword(''); setName(''); setShowForm(false); load() }
    setAdding(false)
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Callers</h1>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus size={16} /> Add Caller
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCaller} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Caller</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={6}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={adding} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {adding ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {callers.length === 0 && <p className="text-gray-500 text-sm">No callers added yet.</p>}
        {callers.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
              <User size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{c.full_name || 'Unnamed'}</p>
              <p className="text-sm text-gray-500">{c.email}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
