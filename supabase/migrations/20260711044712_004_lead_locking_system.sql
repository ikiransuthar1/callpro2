
/*
# Lead Locking System for concurrent call distribution

## Purpose
Prevents duplicate calls — when a caller views a lead, it's "locked" so other
callers under the same dealer don't see it in their queue. Lock is released on:
  1. Caller marks an action (interested, not_interested, etc.) → status changes
  2. Caller clicks "Skip" → lock released, lead back in queue
  3. Caller closes tab / heartbeat times out (after 2 minutes of no heartbeat)
  4. Caller unmounts the component → release via cleanup

## Columns added to `leads`
  - locked_by    uuid  → references auth.users(id), who currently holds the lock
  - locked_at    timestamptz → when the lock was acquired (for timeout detection)

## RLS Notes
  - Callers can only lock leads belonging to their dealer (dealer_id = get_my_dealer_id())
  - Callers can only unlock their own locks (locked_by = auth.uid())
  - The heartbeat update (locked_at refresh) also scoped to own lock
  - A SECURITY DEFINER function `claim_next_lead` atomically picks + locks the next
    available lead, avoiding race conditions between concurrent callers.
*/

-- ─── 1. Add locking columns ────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- Index for fast "next available lead" lookups
CREATE INDEX IF NOT EXISTS idx_leads_unlocked_queue
  ON leads (dealer_id, sort_order)
  WHERE status = 'pending' AND locked_by IS NULL;

-- ─── 2. Update leads UPDATE policy to allow locking by callers ─────────────
-- Callers need to update locked_by/locked_at on leads they're working.
-- They can lock a lead in their dealer's pool, and unlock only their own locks.
DROP POLICY IF EXISTS "leads_update_caller" ON leads;

-- Caller can update a lead IF:
--  (a) it's in their dealer's pool AND they're not changing status to anything
--      other than pending (i.e. just locking), OR
--  (b) they already hold the lock (re-locking / unlocking / updating status)
CREATE POLICY "leads_update_caller" ON leads FOR UPDATE
  TO authenticated
  USING (
    dealer_id = get_my_dealer_id()
    AND (
      locked_by IS NULL
      OR locked_by = auth.uid()
    )
  )
  WITH CHECK (
    dealer_id = get_my_dealer_id()
    AND (
      locked_by IS NULL
      OR locked_by = auth.uid()
    )
  );

-- ─── 3. Atomic "claim next lead" function (SECURITY DEFINER) ──────────────
-- Picks the lowest-sort_order pending+unlocked lead for the caller's dealer,
-- locks it to the current user, and returns the full row. This is atomic via
-- SELECT ... FOR UPDATE SKIP LOCKED, preventing race conditions.
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

  -- Atomically claim the next available lead
  -- Stale locks (> 2 minutes old) are treated as available
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
    AND (p_service_date IS NULL OR service_pending_date = p_service_date)
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

  -- Return the locked lead
  SELECT * INTO v_lead FROM leads WHERE id = v_lead.id;
  RETURN v_lead;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_next_lead(uuid, uuid, text, uuid, date) TO authenticated;

-- ─── 4. Release stale locks function ──────────────────────────────────────
-- Can be called periodically to clean up locks from callers who closed their tab.
-- Also called implicitly in claim_next_lead via the locked_at < now()-2min check.
CREATE OR REPLACE FUNCTION public.release_stale_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE leads
    SET locked_by = NULL, locked_at = NULL
    WHERE locked_by IS NOT NULL
      AND locked_at < (now() - interval '2 minutes')
      AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_stale_locks() TO authenticated;

-- ─── 5. Unlock a specific lead (for skip / explicit release) ──────────────
CREATE OR REPLACE FUNCTION public.unlock_lead(
  p_lead_id uuid,
  p_caller_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE leads
    SET locked_by = NULL, locked_at = NULL
    WHERE id = p_lead_id
      AND locked_by = p_caller_id
      AND status = 'pending';
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_lead(uuid, uuid) TO authenticated;
