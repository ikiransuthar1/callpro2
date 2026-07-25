/*
# Ensure next_service_date / next_service_type columns exist and refresh schema cache

1. Why this migration exists
- The dealer upload throws: "Could not find the 'next_service_date' column
  of 'leads' in the schema cache".
- The columns ARE present in the database, but PostgREST (the REST API
  layer that the Supabase JS client talks to) has a STALE schema cache and
  does not know about them. Inserts referencing these columns are rejected
  even though the columns exist.
- This migration (a) re-declares both columns idempotently so they are
  guaranteed present, and (b) forces PostgREST to reload its schema cache
  via NOTIFY so the REST API picks them up.

2. Columns
- leads.next_service_date  DATE  nullable  — canonical next service date
- leads.next_service_type  TEXT  nullable  — canonical next service type

3. Safety
- ADD COLUMN IF NOT EXISTS is a no-op if the column already exists; no data
  is touched.
- NOTIFY pgrst 'reload schema' is the supported way to refresh the
  PostgREST schema cache without restarting anything.

4. Important notes
- If you ever add columns via raw SQL in the Supabase SQL Editor in the
  future, run `NOTIFY pgrst, 'reload schema';` afterwards or the REST API
  will keep rejecting inserts that use the new columns.
- Alternatively, in the Supabase Dashboard: Project Settings → API →
  click "Reload schema cache", OR Database → Table Editor (opening it can
  also trigger a refresh).
*/

ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_service_date date;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_service_type text;

-- Force PostgREST to rebuild its in-memory schema cache from the live
-- database catalog. This is what makes the new/missing columns visible to
-- the REST API and the Supabase JS client.
NOTIFY pgrst, 'reload schema';
