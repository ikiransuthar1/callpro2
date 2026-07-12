-- 007: Add next_service_date and next_service_type dedicated columns
-- These are canonical columns that replace the ambiguous service_pending_date
-- and service_type. Old columns are kept for backwards-compat; new columns are
-- populated from them on insertion. RPCs are updated to use the new columns.

-- 1. Add columns (nullable so existing rows don't break)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_service_date  date,
  ADD COLUMN IF NOT EXISTS next_service_type  text;

-- 2. Back-fill from existing columns for any already-stored leads
UPDATE public.leads
SET
  next_service_date = service_pending_date,
  next_service_type = service_type
WHERE next_service_date IS NULL OR next_service_type IS NULL;

-- 3. Index for fast date-filter queries
CREATE INDEX IF NOT EXISTS leads_next_service_date_idx
  ON public.leads (dealer_id, next_service_date)
  WHERE status = 'pending';

-- 4. Replace claim_next_lead: now checks BOTH next_service_date (new canonical)
--    AND the legacy service_pending_date / extra_data path for old data.
CREATE OR REPLACE FUNCTION public.claim_next_lead(
  p_dealer_id   uuid,
  p_caller_id   uuid,
  p_service_type text  DEFAULT NULL,
  p_file_id     uuid   DEFAULT NULL,
  p_service_date date  DEFAULT NULL
)
RETURNS leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead        leads;
  v_date_filter text := NULL;
BEGIN
  -- Verify caller belongs to this dealer
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_caller_id AND dealer_id = p_dealer_id AND role = 'caller'
  ) THEN RETURN NULL; END IF;

  IF p_service_date IS NOT NULL THEN
    v_date_filter := to_char(p_service_date, 'YYYY-MM-DD');
  END IF;

  SELECT * INTO v_lead
  FROM leads
  WHERE dealer_id = p_dealer_id
    AND status = 'pending'
    AND (locked_by IS NULL OR locked_at < (now() - interval '2 minutes'))
    AND (p_service_type IS NULL
         OR next_service_type = p_service_type
         OR service_type      = p_service_type)
    AND (p_file_id IS NULL OR file_id = p_file_id)
    AND (
      v_date_filter IS NULL
      -- 1. Canonical column (new uploads)
      OR next_service_date::text = v_date_filter
      -- 2. Legacy structured column
      OR service_pending_date::text = v_date_filter
      -- 3. extra_data JSONB fallback for very old data
      OR (extra_data ? 'Next Service Date'
          AND normalize_date_text(extra_data->>'Next Service Date') = v_date_filter)
    )
  ORDER BY sort_order ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_lead.id IS NULL THEN RETURN NULL; END IF;

  UPDATE leads
  SET locked_by = p_caller_id, locked_at = now()
  WHERE id = v_lead.id;

  SELECT * INTO v_lead FROM leads WHERE id = v_lead.id;
  RETURN v_lead;
END;
$$;

-- 5. Replace count_available_leads similarly
CREATE OR REPLACE FUNCTION public.count_available_leads(
  p_dealer_id   uuid,
  p_service_type text DEFAULT NULL,
  p_file_id     uuid  DEFAULT NULL,
  p_service_date date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count       integer;
  v_date_filter text := NULL;
BEGIN
  IF p_service_date IS NOT NULL THEN
    v_date_filter := to_char(p_service_date, 'YYYY-MM-DD');
  END IF;

  SELECT count(*) INTO v_count
  FROM leads
  WHERE dealer_id = p_dealer_id
    AND status = 'pending'
    AND (locked_by IS NULL OR locked_at < (now() - interval '2 minutes'))
    AND (p_service_type IS NULL
         OR next_service_type = p_service_type
         OR service_type      = p_service_type)
    AND (p_file_id IS NULL OR file_id = p_file_id)
    AND (
      v_date_filter IS NULL
      OR next_service_date::text = v_date_filter
      OR service_pending_date::text = v_date_filter
      OR (extra_data ? 'Next Service Date'
          AND normalize_date_text(extra_data->>'Next Service Date') = v_date_filter)
    );

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_lead(uuid,uuid,text,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_available_leads(uuid,text,uuid,date) TO authenticated;
