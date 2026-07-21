import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type UserRole = 'founder' | 'dealer' | 'caller'

export interface Profile {
  id: string
  role: UserRole
  dealer_id: string | null
  full_name: string | null
  email: string | null
  status: string | null
}

export interface Dealer {
  id: string
  company_name: string
  owner_name: string
  email: string
  phone: string | null
  subscription_status: 'active' | 'suspended' | 'cancelled'
  subscription_plan: 'basic' | 'pro' | 'enterprise'
  max_callers: number
  created_at: string
}

export interface LeadFile {
  id: string
  dealer_id: string
  file_name: string
  original_name: string | null
  total_records: number
  uploaded_by: string | null
  created_at: string
}

export interface Lead {
  id: string
  dealer_id: string
  file_id: string | null
  customer_name: string | null
  phone: string | null
  vehicle_number: string | null
  vehicle_model: string | null
  service_type: string | null
  service_pending_date: string | null
  insurance_expiry_date: string | null
  address: string | null
  email: string | null
  extra_data: Record<string, string> | null
  status: string
  sort_order: number
  locked_by: string | null
  locked_at: string | null
  next_service_date: string | null
  next_service_type: string | null
}
