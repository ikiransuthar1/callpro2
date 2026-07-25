-- Pehle check karega ki column hai ya nahi, nahi hoga toh bana dega
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_service_date text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_service_type text;
-- Yeh command Supabase ke cache ko zabardasti refresh karegi
NOTIFY pgrst, 'reload schema';
