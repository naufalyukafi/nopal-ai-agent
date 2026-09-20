-- Ensure details column exists on audit_logs and reload PostgREST schema cache

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_type TEXT DEFAULT 'general';

NOTIFY pgrst, 'reload schema';
