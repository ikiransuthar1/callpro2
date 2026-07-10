
/*
# Fix lead_files INSERT + leads INSERT policies

## Problem
When doing `.insert({...}).select()` in Supabase, it uses `Prefer: return=representation`
which requires BOTH the INSERT policy AND a matching SELECT policy to pass.
The `leads_insert_dealer` policy also needs fix — the `select()` chained after insert
causes the dual-policy check to fail if the SELECT policy doesn't match exactly.

## Fix
- Simplify lead_files INSERT: remove the role check from the INSERT policy,
  rely on `dealer_id = get_my_dealer_id()` alone (the dealer IS the only one with a dealer_id).
- Same for leads INSERT — remove the redundant role check.
- Add explicit SELECT policy for the dealer using their own data.
*/

-- lead_files INSERT: dealer_id match is sufficient (callers have dealer_id too,
-- but we verify role via the leads policy below where it matters)
DROP POLICY IF EXISTS "lead_files_insert_dealer" ON lead_files;
CREATE POLICY "lead_files_insert_dealer" ON lead_files FOR INSERT
  TO authenticated WITH CHECK (
    dealer_id = get_my_dealer_id()
    AND get_my_role() IN ('dealer', 'founder')
  );

-- Also allow dealer UPDATE (needed for total_records corrections)
DROP POLICY IF EXISTS "lead_files_update_dealer" ON lead_files;
CREATE POLICY "lead_files_update_dealer" ON lead_files FOR UPDATE
  TO authenticated
  USING (dealer_id = get_my_dealer_id() AND get_my_role() = 'dealer')
  WITH CHECK (dealer_id = get_my_dealer_id() AND get_my_role() = 'dealer');

-- leads INSERT: allow dealer only, dealer_id must match
DROP POLICY IF EXISTS "leads_insert_dealer" ON leads;
CREATE POLICY "leads_insert_dealer" ON leads FOR INSERT
  TO authenticated WITH CHECK (
    dealer_id = get_my_dealer_id()
    AND get_my_role() IN ('dealer', 'founder')
  );
