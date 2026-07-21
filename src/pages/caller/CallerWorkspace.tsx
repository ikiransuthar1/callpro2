import { useState, useEffect, useCallback, useRef } from 'react'
import { Phone, PhoneOff, PhoneCall, Calendar, Save, Filter, X } from 'lucide-react'
import { supabase, Lead } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const OUTCOMES = [
  'Answered - Interested',
  'Answered - Not Interested',
  'No Answer',
  'Busy',
  'Callback Scheduled',
  'Wrong Number',
  'Completed',
]

function fmtDate(d: string | null) {
  if (!d) return null
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

// Robust blank check: null, undefined, empty string, whitespace-only, "null"/"undefined" strings
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false
  const s = String(v).trim()
  if (s === '' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'na' || s.toLowerCase() === 'n/a') return false
  return true
}

// Field component: only renders if value is present and non-blank
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!hasValue(value)) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5 break-words">{String(value).trim()}</p>
    </div>
  )
}

type WorkspaceState = 'loading' | 'has_lead' | 'no_leads_for_date' | 'all_done'

export default function CallerWorkspace() {
  const { profile } = useAuth()

  const [filterDate, setFilterDate] = useState<string>('')
  const [showDatePicker, setShowDatePicker] = useState(false)

  const [wsState, setWsState] = useState<WorkspaceState>('loading')
  const [lead, setLead] = useState<Lead | null>(null)
  const [remainingCount, setRemainingCount] = useState(0)

  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [callback, setCallback] = useState('')
  const [saving, setSaving] = useState(false)

  const lockedLeadId = useRef<string | null>(null)

  const fetchNextLead = useCallback(async (releasedId?: string) => {
    if (!profile?.dealer_id || !profile?.id) return

    setWsState('loading')
    setOutcome('')
    setNotes('')
    setCallback('')

    if (releasedId) {
      await supabase
        .from('leads')
        .update({ locked_by: null, locked_at: null })
        .eq('id', releasedId)
        .eq('locked_by', profile.id)
      lockedLeadId.current = null
    }

    let query = supabase
      .from('leads')
      .select('*')
      .eq('dealer_id', profile.dealer_id)
      .eq('status', 'pending')
      .is('locked_by', null)

    if (filterDate) {
      query = query.eq('next_service_date', filterDate)
    }

    const { data } = await query
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (data) {
      await supabase
        .from('leads')
        .update({ locked_by: profile.id, locked_at: new Date().toISOString() })
        .eq('id', data.id)

      lockedLeadId.current = data.id
      setLead(data as Lead)

      let countQ = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('dealer_id', profile.dealer_id)
        .eq('status', 'pending')
        .is('locked_by', null)
      if (filterDate) countQ = countQ.eq('next_service_date', filterDate)
      const { count } = await countQ
      setRemainingCount(count ?? 0)
      setWsState('has_lead')
    } else {
      setLead(null)
      lockedLeadId.current = null
      setRemainingCount(0)
      setWsState(filterDate ? 'no_leads_for_date' : 'all_done')
    }
  }, [profile?.dealer_id, profile?.id, filterDate])

  useEffect(() => {
    fetchNextLead()
  }, [filterDate])

  useEffect(() => {
    return () => {
      if (lockedLeadId.current && profile?.id) {
        supabase
          .from('leads')
          .update({ locked_by: null, locked_at: null })
          .eq('id', lockedLeadId.current)
          .eq('locked_by', profile.id)
      }
    }
  }, [profile?.id])

  async function submitCall() {
    if (!lead || !outcome || !profile?.id || !profile?.dealer_id) return
    setSaving(true)

    await supabase.from('call_logs').insert({
      lead_id: lead.id,
      caller_id: profile.id,
      dealer_id: profile.dealer_id,
      action: outcome,
      excuse_notes: notes || null,
      follow_up_date: callback ? callback.split('T')[0] : null,
    })

    const newStatus =
      outcome.toLowerCase().includes('completed') ? 'completed' :
      outcome.toLowerCase().includes('not interested') ? 'not_interested' :
      outcome.toLowerCase().includes('callback') ? 'callback' : 'called'

    await supabase
      .from('leads')
      .update({ status: newStatus, locked_by: null, locked_at: null })
      .eq('id', lead.id)

    lockedLeadId.current = null
    setSaving(false)
    fetchNextLead(lead.id)
  }

  const filterBar = (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap sticky top-0 z-10">
      <button
        onClick={() => setShowDatePicker((s) => !s)}
        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
          filterDate
            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
            : 'border-gray-300 text-gray-600 hover:border-gray-400'
        }`}
      >
        <Filter size={14} />
        {filterDate ? `Next Service: ${fmtDate(filterDate)}` : 'Filter by Next Service Date'}
      </button>

      {filterDate && (
        <button
          onClick={() => { setFilterDate(''); setShowDatePicker(false) }}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
          title="Clear filter"
        >
          <X size={15} />
        </button>
      )}

      {showDatePicker && (
        <input
          type="date"
          value={filterDate}
          autoFocus
          onChange={(e) => { setFilterDate(e.target.value); setShowDatePicker(false) }}
          onBlur={() => setShowDatePicker(false)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {filterDate && wsState === 'has_lead' && (
        <span className="ml-auto text-xs text-gray-500">
          {remainingCount} lead{remainingCount !== 1 ? 's' : ''} remaining
        </span>
      )}
    </div>
  )

  if (wsState === 'loading') {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col">
        {filterBar}
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    )
  }

  if (wsState === 'no_leads_for_date') {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col">
        {filterBar}
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-16">
          <div className="text-center p-8 max-w-sm">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar size={28} className="text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800">No leads for this date</h2>
            <p className="text-gray-500 text-sm mt-2">
              There are no pending leads with a next service date of{' '}
              <span className="font-medium text-gray-700">{fmtDate(filterDate)}</span>.
            </p>
            <p className="text-gray-400 text-xs mt-1">Try selecting a different date.</p>
            <div className="flex gap-2 justify-center mt-6">
              <button
                onClick={() => { setFilterDate('') }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Clear Filter
              </button>
              <button
                onClick={() => setShowDatePicker(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Pick Another Date
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (wsState === 'all_done') {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col">
        {filterBar}
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-16">
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <PhoneOff size={28} className="text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-700">All caught up!</h2>
            <p className="text-gray-500 mt-1 text-sm">All pending leads have been processed.</p>
            <button
              onClick={() => fetchNextLead()}
              className="mt-5 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!lead) return null

  // Filter extra_data: only show entries that have actual values
  const extraEntries = Object.entries(lead.extra_data ?? {}).filter(([, v]) => hasValue(v))

  // Check each section for visibility — only show sections that have at least one non-blank field
  const hasVehicleInfo = hasValue(lead.vehicle_number) || hasValue(lead.vehicle_model)
  const hasServiceInfo = hasValue(lead.next_service_date) || hasValue(lead.next_service_type) || hasValue(lead.service_pending_date) || hasValue(lead.service_type)
  const hasInsurance = hasValue(lead.insurance_expiry_date)
  const hasContactInfo = hasValue(lead.address) || hasValue(lead.email)
  const hasExtra = extraEntries.length > 0

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gray-50 flex flex-col">
      {filterBar}

      <div className="py-4 px-3 flex-1">
        <div className="max-w-xl mx-auto space-y-3">

          {filterDate && (
            <div className="text-center">
              <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                {remainingCount} lead{remainingCount !== 1 ? 's' : ''} pending for {fmtDate(filterDate)}
              </span>
            </div>
          )}

          {/* Customer card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-white font-bold text-xl leading-tight truncate">
                    {hasValue(lead.customer_name) ? lead.customer_name : 'Unknown Customer'}
                  </h2>
                  {hasValue(lead.phone) && (
                    <p className="text-blue-200 text-base mt-0.5 font-medium">{lead.phone}</p>
                  )}
                </div>
                {hasValue(lead.phone) && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="shrink-0 bg-white text-blue-600 rounded-full p-3 hover:bg-blue-50 transition-colors shadow-md"
                  >
                    <Phone size={22} />
                  </a>
                )}
              </div>
            </div>

            <div className="p-4 space-y-4">

              {hasVehicleInfo && (
                <section>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Vehicle Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Registration No." value={lead.vehicle_number} />
                    <Field label="Model" value={lead.vehicle_model} />
                  </div>
                </section>
              )}

              {hasServiceInfo && (
                <section className="bg-amber-50 rounded-xl border border-amber-100 p-3">
                  <p className="text-[11px] font-bold text-amber-700 uppercase tracking-widest mb-2">Service Info</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Next Service Date" value={fmtDate(lead.next_service_date)} />
                    <Field label="Next Service Type" value={lead.next_service_type} />
                    <Field label="Last Service Date" value={fmtDate(lead.service_pending_date)} />
                    <Field label="Last Service Type" value={lead.service_type} />
                  </div>
                </section>
              )}

              {hasInsurance && (
                <section className="bg-red-50 rounded-xl border border-red-100 p-3">
                  <Field label="Insurance Expiry" value={fmtDate(lead.insurance_expiry_date)} />
                </section>
              )}

              {hasContactInfo && (
                <section>
                  <div className="grid grid-cols-1 gap-2">
                    <Field label="Address" value={lead.address} />
                    <Field label="Email" value={lead.email} />
                  </div>
                </section>
              )}

              {hasExtra && (
                <section className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Additional Info</p>
                  <div className="grid grid-cols-2 gap-3">
                    {extraEntries.map(([key, val]) => (
                      <Field key={key} label={key} value={String(val)} />
                    ))}
                  </div>
                </section>
              )}

            </div>
          </div>

          {/* Call outcome */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <PhoneCall size={16} className="text-blue-600" /> Log Call Outcome
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={`text-left text-sm px-3 py-2 rounded-xl border transition-all ${
                    outcome === o
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>

            {outcome.toLowerCase().includes('callback') && (
              <div>
                <label className="block text-sm text-gray-600 mb-1 flex items-center gap-1">
                  <Calendar size={14} /> Callback Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  value={callback}
                  onChange={(e) => setCallback(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-600 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add notes about the call..."
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <button
              onClick={submitCall}
              disabled={!outcome || saving}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {saving ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Saving...</>
              ) : (
                <><Save size={16} /> Save &amp; Next Lead</>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
