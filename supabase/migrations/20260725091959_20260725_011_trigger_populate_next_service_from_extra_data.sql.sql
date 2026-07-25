-- PostgREST schema cache does not reliably expose next_service_date /
-- next_service_type even though the columns exist physically.
-- Fix: a BEFORE INSERT trigger populates these columns from extra_data so
-- the insert payload never needs to reference them directly. This is a
-- permanent, cache-proof solution.

CREATE OR REPLACE FUNCTION populate_next_service_from_extra_data()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  nsd text;
  nst text;
BEGIN
  -- Pull values that the frontend writes into extra_data under these keys.
  nsd := NEW.extra_data->>'_next_service_date';
  nst := NEW.extra_data->>'_next_service_type';

  -- Populate the dedicated columns when values were supplied.
  IF nsd IS NOT NULL AND nsd <> '' THEN
    BEGIN
      NEW.next_service_date := nsd::date;
    EXCEPTION WHEN OTHERS THEN
      -- If the value cannot be cast to date, ignore it silently.
      NULL;
    END;
  END IF;

  IF nst IS NOT NULL AND nst <> '' THEN
    NEW.next_service_type := nst;
  END IF;

  -- Remove the private staging keys from the stored JSON so the UI only
  -- sees the real extra columns.
  NEW.extra_data := NEW.extra_data - '_next_service_date' - '_next_service_type';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_next_service ON leads;
CREATE TRIGGER trg_populate_next_service
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION populate_next_service_from_extra_data();
