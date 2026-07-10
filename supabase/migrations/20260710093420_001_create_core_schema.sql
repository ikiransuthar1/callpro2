
/*
# Create core schema: dealers, profiles, lead_files, leads, call_logs

## Summary
This migration sets up the complete multi-tier SaaS calling software schema.

## New Tables

### dealers
Company/dealer accounts created by the Founder.
- id, company_name, owner_name, email, phone, subscription_status, subscription_plan, max_callers, created_by

### profiles
Extends auth.users with role-based access control.
- id (matches auth.users.id), email, full_name, role (founder/dealer/caller), dealer_id, status (active/blocked)

### lead_files
Tracks uploaded Excel/CSV files per dealer.
- id, dealer_id, file_name, original_name, total_records, uploaded_by

### leads
Customer records uploaded by dealers.
- id, dealer_id, file_id, customer_name, phone, vehicle_number, vehicle_model, service_type, service_pending_date, insurance_expiry_date, address, email, notes, status, assigned_caller_id, sort_order

### call_logs
Records every call action made by callers.
- id, dealer_id, lead_id, caller_id, action, excuse_notes, follow_up_date, called_at

## Security
- RLS enabled on all tables
- Founders can see/manage everything
- Dealers isolated by dealer_id
- Callers isolated by their dealer_id
*/

-- ============================================================
-- 1. DEALERS
-- ============================================================
CREATE TABLE IF NOT EXISTS dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  owner_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  subscription_status text NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'suspended', 'cancelled')),
  subscription_plan text NOT NULL DEFAULT 'basic'
    CHECK (subscription_plan IN ('basic', 'pro', 'enterprise')),
  max_callers int NOT NULL DEFAULT 10,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. PROFILES (references dealers, must come after)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'caller'
    CHECK (role IN ('founder', 'dealer', 'caller')),
  dealer_id uuid REFERENCES dealers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. LEAD_FILES
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  original_name text NOT NULL,
  total_records int NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lead_files ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. LEADS
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  file_id uuid REFERENCES lead_files(id) ON DELETE CASCADE,
  customer_name text,
  phone text,
  vehicle_number text,
  vehicle_model text,
  service_type text,
  service_pending_date date,
  insurance_expiry_date date,
  address text,
  email text,
  extra_data jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'called', 'follow_up', 'completed', 'not_interested')),
  assigned_caller_id uuid REFERENCES auth.users(id),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS leads_dealer_id_idx ON leads(dealer_id);
CREATE INDEX IF NOT EXISTS leads_file_id_idx ON leads(file_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_service_pending_date_idx ON leads(service_pending_date);
CREATE INDEX IF NOT EXISTS leads_insurance_expiry_date_idx ON leads(insurance_expiry_date);

-- ============================================================
-- 5. CALL_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL
    CHECK (action IN ('interested', 'not_interested', 'call_later', 'no_answer', 'busy', 'wrong_number', 'completed')),
  excuse_notes text,
  follow_up_date date,
  called_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS call_logs_dealer_id_idx ON call_logs(dealer_id);
CREATE INDEX IF NOT EXISTS call_logs_lead_id_idx ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS call_logs_caller_id_idx ON call_logs(caller_id);
CREATE INDEX IF NOT EXISTS call_logs_follow_up_date_idx ON call_logs(follow_up_date);

-- ============================================================
-- RLS POLICIES — profiles
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_founder" ON profiles;
CREATE POLICY "profiles_select_founder" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'founder')
  );

DROP POLICY IF EXISTS "profiles_select_dealer_callers" ON profiles;
CREATE POLICY "profiles_select_dealer_callers" ON profiles FOR SELECT
  TO authenticated USING (
    dealer_id IS NOT NULL AND dealer_id = (
      SELECT p.dealer_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_founder" ON profiles;
CREATE POLICY "profiles_update_founder" ON profiles FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'founder'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'founder'));

DROP POLICY IF EXISTS "profiles_delete_founder" ON profiles;
CREATE POLICY "profiles_delete_founder" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'founder')
  );

-- ============================================================
-- RLS POLICIES — dealers
-- ============================================================
DROP POLICY IF EXISTS "dealers_select_founder" ON dealers;
CREATE POLICY "dealers_select_founder" ON dealers FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder')
  );

DROP POLICY IF EXISTS "dealers_select_own" ON dealers;
CREATE POLICY "dealers_select_own" ON dealers FOR SELECT
  TO authenticated USING (
    id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
  );

DROP POLICY IF EXISTS "dealers_insert_founder" ON dealers;
CREATE POLICY "dealers_insert_founder" ON dealers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder')
  );

DROP POLICY IF EXISTS "dealers_update_founder" ON dealers;
CREATE POLICY "dealers_update_founder" ON dealers FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder'));

DROP POLICY IF EXISTS "dealers_delete_founder" ON dealers;
CREATE POLICY "dealers_delete_founder" ON dealers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder')
  );

-- ============================================================
-- RLS POLICIES — lead_files
-- ============================================================
DROP POLICY IF EXISTS "lead_files_select_founder" ON lead_files;
CREATE POLICY "lead_files_select_founder" ON lead_files FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder')
  );

DROP POLICY IF EXISTS "lead_files_select_dealer_caller" ON lead_files;
CREATE POLICY "lead_files_select_dealer_caller" ON lead_files FOR SELECT
  TO authenticated USING (
    dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
  );

DROP POLICY IF EXISTS "lead_files_insert_dealer" ON lead_files;
CREATE POLICY "lead_files_insert_dealer" ON lead_files FOR INSERT
  TO authenticated WITH CHECK (
    dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'dealer')
  );

DROP POLICY IF EXISTS "lead_files_delete_dealer" ON lead_files;
CREATE POLICY "lead_files_delete_dealer" ON lead_files FOR DELETE
  TO authenticated USING (
    dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'dealer')
  );

-- ============================================================
-- RLS POLICIES — leads
-- ============================================================
DROP POLICY IF EXISTS "leads_select_founder" ON leads;
CREATE POLICY "leads_select_founder" ON leads FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder')
  );

DROP POLICY IF EXISTS "leads_select_dealer_caller" ON leads;
CREATE POLICY "leads_select_dealer_caller" ON leads FOR SELECT
  TO authenticated USING (
    dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
  );

DROP POLICY IF EXISTS "leads_insert_dealer" ON leads;
CREATE POLICY "leads_insert_dealer" ON leads FOR INSERT
  TO authenticated WITH CHECK (
    dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'dealer')
  );

DROP POLICY IF EXISTS "leads_update_dealer" ON leads;
CREATE POLICY "leads_update_dealer" ON leads FOR UPDATE
  TO authenticated
  USING (dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'dealer'))
  WITH CHECK (dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'dealer'));

DROP POLICY IF EXISTS "leads_update_caller" ON leads;
CREATE POLICY "leads_update_caller" ON leads FOR UPDATE
  TO authenticated
  USING (dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'caller'))
  WITH CHECK (dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'caller'));

DROP POLICY IF EXISTS "leads_delete_dealer" ON leads;
CREATE POLICY "leads_delete_dealer" ON leads FOR DELETE
  TO authenticated USING (
    dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'dealer')
  );

-- ============================================================
-- RLS POLICIES — call_logs
-- ============================================================
DROP POLICY IF EXISTS "call_logs_select_founder" ON call_logs;
CREATE POLICY "call_logs_select_founder" ON call_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder')
  );

DROP POLICY IF EXISTS "call_logs_select_dealer_caller" ON call_logs;
CREATE POLICY "call_logs_select_dealer_caller" ON call_logs FOR SELECT
  TO authenticated USING (
    dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
  );

DROP POLICY IF EXISTS "call_logs_insert_caller" ON call_logs;
CREATE POLICY "call_logs_insert_caller" ON call_logs FOR INSERT
  TO authenticated WITH CHECK (
    caller_id = auth.uid()
    AND dealer_id = (SELECT profiles.dealer_id FROM profiles WHERE profiles.id = auth.uid())
  );

DROP POLICY IF EXISTS "call_logs_update_caller" ON call_logs;
CREATE POLICY "call_logs_update_caller" ON call_logs FOR UPDATE
  TO authenticated
  USING (caller_id = auth.uid())
  WITH CHECK (caller_id = auth.uid());

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_dealers_updated_at ON dealers;
CREATE TRIGGER update_dealers_updated_at
  BEFORE UPDATE ON dealers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
