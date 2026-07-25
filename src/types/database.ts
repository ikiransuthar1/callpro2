// Updated on 11 July
export type UserRole = 'founder' | 'dealer' | 'caller';
export type UserStatus = 'active' | 'blocked';
export type SubscriptionStatus = 'active' | 'suspended' | 'cancelled';
export type SubscriptionPlan = 'basic' | 'pro' | 'enterprise';
export type LeadStatus = 'pending' | 'called' | 'follow_up' | 'completed' | 'not_interested';
export type CallAction = 'interested' | 'not_interested' | 'call_later' | 'no_answer' | 'busy' | 'wrong_number' | 'completed';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  dealer_id: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface Dealer {
  id: string;
  company_name: string;
  owner_name: string;
  email: string;
  phone: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan: SubscriptionPlan;
  max_callers: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadFile {
  id: string;
  dealer_id: string;
  file_name: string;
  original_name: string;
  total_records: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  dealer_id: string;
  file_id: string | null;
  customer_name: string | null;
  phone: string | null;
  vehicle_number: string | null;
  vehicle_model: string | null;
  /** Last Service Type (legacy dedicated column). */
  service_type: string | null;
  /** Last Service Date (legacy dedicated column, YYYY-MM-DD). */
  service_pending_date: string | null;
  insurance_expiry_date: string | null;
  address: string | null;
  email: string | null;
  extra_data: Record<string, unknown> | null;
  status: LeadStatus;
  assigned_caller_id: string | null;
  locked_by: string | null;
  locked_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/* next_service_date / next_service_type live inside extra_data (jsonb) to
 * avoid PostgREST schema-cache issues with dedicated columns. These helpers
 * read them back uniformly across the app. */
export const NEXT_SERVICE_DATE_KEY = 'next_service_date';
export const NEXT_SERVICE_TYPE_KEY = 'next_service_type';

export function getNextServiceDate(lead: Pick<Lead, 'extra_data'>): string | null {
  const ed = lead.extra_data;
  const v = ed && typeof ed === 'object' ? (ed as Record<string, unknown>)[NEXT_SERVICE_DATE_KEY] : undefined;
  const s = v === null || v === undefined ? null : String(v).trim();
  return s || null;
}

export function getNextServiceType(lead: Pick<Lead, 'extra_data'>): string | null {
  const ed = lead.extra_data;
  const v = ed && typeof ed === 'object' ? (ed as Record<string, unknown>)[NEXT_SERVICE_TYPE_KEY] : undefined;
  const s = v === null || v === undefined ? null : String(v).trim();
  return s || null;
}

export interface CallLog {
  id: string;
  dealer_id: string;
  lead_id: string;
  caller_id: string;
  action: CallAction;
  excuse_notes: string | null;
  follow_up_date: string | null;
  called_at: string;
}

export interface CallLogWithLead extends CallLog {
  leads: Lead;
  profiles: Profile;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
      };
      dealers: {
        Row: Dealer;
        Insert: Omit<Dealer, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Dealer, 'id' | 'created_at' | 'updated_at'>>;
      };
      lead_files: {
        Row: LeadFile;
        Insert: Omit<LeadFile, 'id' | 'created_at'>;
        Update: Partial<Omit<LeadFile, 'id' | 'created_at'>>;
      };
      leads: {
        Row: Lead;
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Lead, 'id' | 'created_at' | 'updated_at'>>;
      };
      call_logs: {
        Row: CallLog;
        Insert: Omit<CallLog, 'id' | 'called_at'>;
        Update: Partial<Omit<CallLog, 'id' | 'called_at'>>;
      };
    };
  };
};
