-- Migration: Fix Row Level Security (RLS) policies and enforce audit log immutability

-- 1. Fix RLS policies on public.chat_messages
DROP POLICY IF EXISTS "Service role full access on chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can view their own chat messages" ON public.chat_messages;

CREATE POLICY "Users can view their own chat messages"
    ON public.chat_messages
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on chat_messages"
    ON public.chat_messages
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. Fix RLS policies on public.audit_logs
DROP POLICY IF EXISTS "Service role full access on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can view their own audit logs" ON public.audit_logs;

CREATE POLICY "Users can view their own audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on audit_logs"
    ON public.audit_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. Enforce immutability on audit_logs (SOC 2 / ISO 27001 Compliance)
-- Prevent modification or deletion of audit logs by authenticated or anonymous users
REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, authenticated, anon;

-- Notify PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
