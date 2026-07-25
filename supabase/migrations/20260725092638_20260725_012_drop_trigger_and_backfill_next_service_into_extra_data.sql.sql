-- Going fully cache-proof: next_service_date / next_service_type are stored
-- inside extra_data (jsonb) instead of as dedicated columns, since
-- PostgREST's schema cache does not reliably expose the dedicated columns.

-- 1. Drop the staging trigger — no longer needed.
DROP TRIGGER IF EXISTS trg_populate_next_service ON leads;
DROP FUNCTION IF EXISTS populate_next_service_from_extra_data();

-- 2. Backfill: copy any existing dedicated-column values into extra_data
--    under clean lowercase keys so the frontend can read them uniformly.
UPDATE leads
SET extra_data = COALESCE(extra_data, '{}'::jsonb)
  || jsonb_build_object(
    'next_service_date',  next_service_date,
    'next_service_type',  next_service_type
  )
WHERE next_service_date IS NOT NULL
   OR next_service_type IS NOT NULL;

-- 3. Also migrate any legacy staging keys from the earlier trigger approach.
UPDATE leads
SET extra_data = (extra_data - '_next_service_date' - '_next_service_type')
  || jsonb_build_object(
    'next_service_date',  extra_data->>'_next_service_date',
    'next_service_type',  extra_data->>'_next_service_type'
  )
WHERE extra_data ? '_next_service_date'
   OR extra_data ? '_next_service_type';
