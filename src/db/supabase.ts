import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.ts';

/**
 * Returns a Supabase Admin Client powered by SUPABASE_SERVICE_ROLE_KEY.
 * Used exclusively for backend service operations (Telegram bot webhook, scheduled crons).
 * Note: Database queries using this client MUST explicitly scope records by `user_id`.
 */
export function getSupabaseClient() {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Alias for getSupabaseClient() to make administrative usage explicit.
 */
export const getSupabaseAdminClient = getSupabaseClient;

