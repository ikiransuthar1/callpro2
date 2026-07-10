
/*
# Fix: Infinite recursion in profiles RLS policies

## Problem
The profiles SELECT policies contained subqueries like:
  `EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'founder')`
This queries the `profiles` table from within a `profiles` policy → infinite recursion → HTTP 500.

## Fix
1. Create two SECURITY DEFINER helper functions that bypass RLS to read the caller's own role/dealer_id.
   SECURITY DEFINER means these run as the function owner (postgres), so they can query profiles
   without triggering the RLS policies, breaking the recursion loop.
2. Drop all recursive policies on profiles, dealers, lead_files, leads, call_logs.
3. Recreate all policies using the helper functions — no more self-referential queries.

## New Functions
- `get_my_role()` — returns the role ('founder'|'dealer'|'caller') of the current auth.uid()
- `get_my_dealer_id()` — returns the dealer_id uuid of the current auth.uid()

## Security Notes
- Both functions are STABLE (read-only, safe for policy use)
- search_path is locked to `public` to prevent search_path injection
- These functions only return data for the currently authenticated user
*/

-- ============================================================
-- 1. SECURITY DEFINER helper functions (break the recursion)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_dealer_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dealer_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 2. FIX profiles policies (were self-referential → recursion)
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_founder" ON profiles;
DROP POLICY IF EXISTS "profiles_select_dealer_callers" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_founder" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_founder" ON profiles;

-- Each user reads their own row (no recursion)
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Founder reads all profiles via security-definer function
CREATE POLICY "profiles_select_founder" ON profiles FOR SELECT
  TO authenticated USING (get_my_role() = 'founder');

-- Dealer reads profiles of their own callers via security-definer function
CREATE POLICY "profiles_select_dealer_callers" ON profiles FOR SELECT
  TO authenticated USING (
    dealer_id IS NOT NULL
    AND dealer_id = get_my_dealer_id()
  );

CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_founder" ON profiles FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'founder')
  WITH CHECK (get_my_role() = 'founder');

CREATE POLICY "profiles_delete_founder" ON profiles FOR DELETE
  TO authenticated USING (get_my_role() = 'founder');

-- ============================================================
-- 3. FIX dealers policies (used recursive profiles subqueries)
-- ============================================================

DROP POLICY IF EXISTS "dealers_select_founder" ON dealers;
DROP POLICY IF EXISTS "dealers_select_own" ON dealers;
DROP POLICY IF EXISTS "dealers_insert_founder" ON dealers;
DROP POLICY IF EXISTS "dealers_update_founder" ON dealers;
DROP POLICY IF EXISTS "dealers_delete_founder" ON dealers;

CREATE POLICY "dealers_select_founder" ON dealers FOR SELECT
  TO authenticated USING (get_my_role() = 'founder');

CREATE POLICY "dealers_select_own" ON dealers FOR SELECT
  TO authenticated USING (id = get_my_dealer_id());

CREATE POLICY "dealers_insert_founder" ON dealers FOR INSERT
  TO authenticated WITH CHECK (get_my_role() = 'founder');

CREATE POLICY "dealers_update_founder" ON dealers FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'founder')
  WITH CHECK (get_my_role() = 'founder');

CREATE POLICY "dealers_delete_founder" ON dealers FOR DELETE
  TO authenticated USING (get_my_role() = 'founder');

-- ============================================================
-- 4. FIX lead_files policies
-- ============================================================

DROP POLICY IF EXISTS "lead_files_select_founder" ON lead_files;
DROP POLICY IF EXISTS "lead_files_select_dealer_caller" ON lead_files;
DROP POLICY IF EXISTS "lead_files_insert_dealer" ON lead_files;
DROP POLICY IF EXISTS "lead_files_delete_dealer" ON lead_files;

CREATE POLICY "lead_files_select_founder" ON lead_files FOR SELECT
  TO authenticated USING (get_my_role() = 'founder');

CREATE POLICY "lead_files_select_dealer_caller" ON lead_files FOR SELECT
  TO authenticated USING (dealer_id = get_my_dealer_id());

CREATE POLICY "lead_files_insert_dealer" ON lead_files FOR INSERT
  TO authenticated WITH CHECK (
    dealer_id = get_my_dealer_id()
    AND get_my_role() = 'dealer'
  );

CREATE POLICY "lead_files_delete_dealer" ON lead_files FOR DELETE
  TO authenticated USING (
    dealer_id = get_my_dealer_id()
    AND get_my_role() = 'dealer'
  );

-- ============================================================
-- 5. FIX leads policies
-- ============================================================

DROP POLICY IF EXISTS "leads_select_founder" ON leads;
DROP POLICY IF EXISTS "leads_select_dealer_caller" ON leads;
DROP POLICY IF EXISTS "leads_insert_dealer" ON leads;
DROP POLICY IF EXISTS "leads_update_dealer" ON leads;
DROP POLICY IF EXISTS "leads_update_caller" ON leads;
DROP POLICY IF EXISTS "leads_delete_dealer" ON leads;

CREATE POLICY "leads_select_founder" ON leads FOR SELECT
  TO authenticated USING (get_my_role() = 'founder');

CREATE POLICY "leads_select_dealer_caller" ON leads FOR SELECT
  TO authenticated USING (dealer_id = get_my_dealer_id());

CREATE POLICY "leads_insert_dealer" ON leads FOR INSERT
  TO authenticated WITH CHECK (
    dealer_id = get_my_dealer_id()
    AND get_my_role() = 'dealer'
  );

CREATE POLICY "leads_update_dealer" ON leads FOR UPDATE
  TO authenticated
  USING (dealer_id = get_my_dealer_id() AND get_my_role() = 'dealer')
  WITH CHECK (dealer_id = get_my_dealer_id() AND get_my_role() = 'dealer');

CREATE POLICY "leads_update_caller" ON leads FOR UPDATE
  TO authenticated
  USING (dealer_id = get_my_dealer_id() AND get_my_role() = 'caller')
  WITH CHECK (dealer_id = get_my_dealer_id() AND get_my_role() = 'caller');

CREATE POLICY "leads_delete_dealer" ON leads FOR DELETE
  TO authenticated USING (
    dealer_id = get_my_dealer_id()
    AND get_my_role() = 'dealer'
  );

-- ============================================================
-- 6. FIX call_logs policies
-- ============================================================

DROP POLICY IF EXISTS "call_logs_select_founder" ON call_logs;
DROP POLICY IF EXISTS "call_logs_select_dealer_caller" ON call_logs;
DROP POLICY IF EXISTS "call_logs_insert_caller" ON call_logs;
DROP POLICY IF EXISTS "call_logs_update_caller" ON call_logs;

CREATE POLICY "call_logs_select_founder" ON call_logs FOR SELECT
  TO authenticated USING (get_my_role() = 'founder');

CREATE POLICY "call_logs_select_dealer_caller" ON call_logs FOR SELECT
  TO authenticated USING (dealer_id = get_my_dealer_id());

CREATE POLICY "call_logs_insert_caller" ON call_logs FOR INSERT
  TO authenticated WITH CHECK (
    caller_id = auth.uid()
    AND dealer_id = get_my_dealer_id()
  );

CREATE POLICY "call_logs_update_caller" ON call_logs FOR UPDATE
  TO authenticated
  USING (caller_id = auth.uid())
  WITH CHECK (caller_id = auth.uid());
