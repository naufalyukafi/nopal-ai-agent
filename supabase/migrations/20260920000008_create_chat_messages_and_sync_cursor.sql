-- Migration: Create chat_messages table for Multi-Turn AI Memory and add sync timestamp cursor to email_accounts

-- 1. Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'model', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fast retrieval of user conversation history
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_date ON public.chat_messages(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Security Policy: Users can view their own chat messages
CREATE POLICY "Users can view their own chat messages"
    ON public.chat_messages
    FOR SELECT
    USING (auth.uid() = user_id);

-- Security Policy: Service role full access
CREATE POLICY "Service role full access on chat_messages"
    ON public.chat_messages
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 2. Add last_synced_message_timestamp cursor column to email_accounts table
ALTER TABLE public.email_accounts ADD COLUMN IF NOT EXISTS last_synced_message_timestamp TIMESTAMPTZ;

-- Notify PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
