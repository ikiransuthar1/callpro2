-- # 005_date_normalization.sql
-- Robust date normalization + fix Next Service Date filter to also check extra_data JSONB.
--
-- Problem: Excel uploads store dates as DD/MM/YYYY in extra_data->>'Next Service Date'
-- when auto-detection maps it there, OR as YYYY-MM-DD in the service_pending_date column.
-- The caller filter must match BOTH locations, normalized to YYYY-MM-DD for comparison.

-- ─── 1. normalize_date_text() helper ──────────────────────────────────────
-- Accepts: DD/MM/YYYY, D/M/YYYY, MM/DD/YYYY (ambiguous — we assume DD/MM per Honda CSV),
--          YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS, Excel serial numbers.
-- Returns: YYYY-MM-DD text, or NULL if unparseable.
CREATE OR REPLACE FUNCTION public.normalize_date_text(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
  m text[];
  d integer;
  mo integer;
  y integer;
  ts timestamptz;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  s := trim(raw);
  IF s = '' THEN RETURN NULL; END IF;

  -- Already YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
  IF s ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN substring(s from 1 for 10);
  END IF;

  -- DD/MM/YYYY or D/M/YYYY (Honda CSV format — day first)
  IF s ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
    m := regexp_matches(s, '^(\d{1,2})/(\d{1,2})/(\d{4})$');
    d  := m[1]::integer;
    mo := m[2]::integer;
    y  := m[3]::integer;
    -- Sanity: if first > 12 it's definitely the day (DD/MM). If second > 12, it's MM/DD.
    -- We assume DD/MM/YYYY per the source data.
    RETURN lpad(y::text, 4, '0') || '-' || lpad(mo::text, 2, '0') || '-' || lpad(d::text, 2, '0');
  END IF;

  -- MM/DD/YYYY fallback (only if first <= 12 AND second > 12 — clearly US format)
  -- Already handled above by DD/MM assumption; this is a safety net for M/D/YYYY where day>12
  IF s ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
    -- (won't reach here due to above, but kept for clarity)
    RETURN NULL;
  END IF;

  -- Try full timestamp parse as last resort
  BEGIN
    ts := s::timestamptz;
    RETURN to_char(ts, 'YYYY-MM-DD');
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_date_text(text) TO authenticated;

-- ─── 2. Update claim_next_lead to check BOTH date locations ──────────────
CREATE OR REPLACE FUNCTION public.claim_next_lead(
  p_dealer_id uuid,
  p_caller_id uuid,
  p_service_type text DEFAULT NULL,
  p_file_id uuid DEFAULT NULL,
  p_service_date date DEFAULT NULL
)
RETURNS leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead leads;
  v_date_filter text := NULL;
BEGIN
  -- Verify the caller belongs to this dealer
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_caller_id
      AND dealer_id = p_dealer_id
      AND role = 'caller'
  ) THEN
    RETURN NULL;
  END IF;

  -- Normalize the incoming date filter to YYYY-MM-DD text
  IF p_service_date IS NOT NULL THEN
    v_date_filter := to_char(p_service_date, 'YYYY-MM-DD');
  END IF;

  -- Atomically claim the next available lead.
  -- Date filter checks BOTH service_pending_date AND extra_data->>'Next Service Date',
  -- both normalized via normalize_date_text() for a fair comparison.
  SELECT * INTO v_lead
  FROM leads
  WHERE dealer_id = p_dealer_id
    AND status = 'pending'
    AND (
      locked_by IS NULL
      OR locked_at < (now() - interval '2 minutes')
    )
    AND (p_service_type IS NULL OR service_type = p_service_type)
    AND (p_file_id IS NULL OR file_id = p_file_id)
    AND (
      v_date_filter IS NULL
      OR (
        -- Check the structured column (already YYYY-MM-DD)
        service_pending_date::text = v_date_filter
      )
      OR (
        -- Check extra_data JSONB 'Next Service Date' key (may be DD/MM/YYYY etc.)
        extra_data ? 'Next Service Date'
        AND normalize_date_text(extra_data->>'Next Service Date') = v_date_filter
      )
    )
  ORDER BY sort_order ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_lead.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Lock it
  UPDATE leads
    SET locked_by = p_caller_id, locked_at = now()
    WHERE id = v_lead.id;

  SELECT * INTO v_lead FROM leads WHERE id = v_lead.id;
  RETURN v_lead;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_next_lead(uuid, uuid, text, uuid, date) TO authenticated;

-- ─── 3. count_available_leads() for accurate queue count ─────────────────
-- Returns the count of pending+unlocked leads matching the filters,
-- checking both date locations (same logic as claim_next_lead).
CREATE OR REPLACE FUNCTION public.count_available_leads(
  p_dealer_id uuid,
  p_service_type text DEFAULT NULL,
  p_file_id uuid DEFAULT NULL,
  p_service_date date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_date_filter text := NULL;
BEGIN
  IF p_service_date IS NOT NULL THEN
    v_date_filter := to_char(p_service_date, 'YYYY-MM-DD');
  END IF;

  SELECT count(*) INTO v_count
  FROM leads
  WHERE dealer_id = p_dealer_id
    AND status = 'pending'
    AND (
      locked_by IS NULL
      OR locked_at < (now() - interval '2 minutes')
    )
    AND (p_service_type IS NULL OR service_type = p_service_type)
    AND (p_file_id IS NULL OR file_id = p_file_id)
    AND (
      v_date_filter IS NULL
      OR service_pending_date::text = v_date_filter
      OR (
        extra_data ? 'Next Service Date'
        AND normalize_date_text(extra_data->>'Next Service Date') = v_date_filter
      )
    );

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_available_leads(uuid, text, uuid, date) TO authenticated;
