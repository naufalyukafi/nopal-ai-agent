// Centralized environment variable manager supporting Deno Edge Runtime & Node.js

export function getEnv(key: string, defaultValue?: string): string {
  // @ts-ignore
  if (typeof Deno !== 'undefined' && Deno?.env?.get) {
    // @ts-ignore
    const val = Deno.env.get(key);
    if (val !== undefined && val !== '') return val;
  }
  if (typeof process !== 'undefined' && process?.env) {
    const val = process.env[key];
    if (val !== undefined && val !== '') return val;
  }
  return defaultValue || '';
}

export const env = {
  get SUPABASE_URL() {
    return getEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return getEnv('SUPABASE_SERVICE_ROLE_KEY', 'YOUR_SUPABASE_SERVICE_ROLE_KEY');
  },
  get GEMINI_API_KEY() {
    return getEnv('GEMINI_API_KEY');
  },
  get GEMINI_MODEL() {
    return getEnv('GEMINI_MODEL', 'gemini-3.5-flash-lite');
  },
  get TELEGRAM_BOT_TOKEN() {
    return getEnv('TELEGRAM_BOT_TOKEN');
  },
  get TELEGRAM_SECRET_TOKEN() {
    return getEnv('TELEGRAM_SECRET_TOKEN');
  },
  get GMAIL_CLIENT_ID() {
    return getEnv('GMAIL_CLIENT_ID');
  },
  get GMAIL_CLIENT_SECRET() {
    return getEnv('GMAIL_CLIENT_SECRET');
  },
  get GMAIL_REDIRECT_URI() {
    return getEnv('GMAIL_REDIRECT_URI', 'http://127.0.0.1:54321/functions/v1/gmail-sync/callback');
  },
  get ENCRYPTION_SECRET() {
    return getEnv('ENCRYPTION_SECRET', 'nopal-financial-default-secret-key-32bytes');
  },
};
