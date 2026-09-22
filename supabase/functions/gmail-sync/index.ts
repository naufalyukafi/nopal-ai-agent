import { Hono } from 'hono';
import { getGoogleOAuthUrl, exchangeOAuthCodeForToken } from '../../../src/services/gmail.ts';
import { getSupabaseClient } from '../../../src/db/supabase.ts';
import { env } from '../../../src/config/env.ts';
import { logger } from '../../../src/utils/logger.ts';

const app = new Hono();

// 1. Endpoint to generate Google OAuth Login URL
app.get('/gmail-sync/auth', (c) => {
  const userId = c.req.query('userId');
  if (!userId) {
    return c.json({ error: 'userId query parameter is required' }, 400);
  }

  try {
    const authUrl = getGoogleOAuthUrl(userId);
    return c.redirect(authUrl);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// 2. OAuth Callback endpoint from Google Consent screen
app.get('/gmail-sync/callback', async (c) => {
  const code = c.req.query('code');
  const stateStr = c.req.query('state');

  if (!code || !stateStr) {
    return c.text('OAuth error: missing authorization code or state', 400);
  }

  try {
    const { userId } = JSON.parse(decodeURIComponent(stateStr));
    const result = await exchangeOAuthCodeForToken(code, userId);

    // Send proactive confirmation message directly to user's Telegram chat
    try {
      const supabase = getSupabaseClient();
      const { data: user } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', userId)
        .single();

      if (user?.telegram_id && env.TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: user.telegram_id,
            text: `*Akun Gmail Berhasil Terhubung*\n\nAkun \`${result.emailAccount.email}\` telah berhasil ditautkan ke Nopal Agent.\n\nSekarang Nopal Agent akan mendeteksi notifikasi transaksi dari email Anda secara otomatis.`,
            parse_mode: 'Markdown',
          }),
        });
      }
    } catch (notifyErr) {
      logger.warn('GmailSync', 'Failed to send Telegram notification after Gmail OAuth', { error: String(notifyErr) });
    }

    c.header('Content-Type', 'text/html; charset=utf-8');
    return c.html(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gmail Connected - Nopal Agent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0F172A; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #1E293B; border-radius: 16px; padding: 40px 30px; text-align: center; max-width: 420px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
    h1 { color: #10B981; font-size: 22px; margin-bottom: 12px; }
    p { color: #94A3B8; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
    .email { background: #0F172A; color: #38BDF8; padding: 6px 12px; border-radius: 6px; font-family: monospace; font-size: 13px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Akun Gmail Berhasil Terhubung</h1>
    <p>Akun <span class="email">${result.emailAccount.email}</span> telah berhasil ditautkan ke Nopal Agent.</p>
    <p>Pemberitahuan telah dikirimkan ke obrolan Telegram Anda. Anda dapat menutup halaman ini sekarang.</p>
  </div>
</body>
</html>`);
  } catch (err) {
    logger.error('GmailSync', 'Error during Gmail OAuth callback', err);
    return c.text(`Gagal menghubungkan Gmail: ${String(err)}`, 500);
  }
});

// 3. Cron / Periodic endpoint to sync all active user Gmail accounts
app.all('/gmail-sync/process', async (c) => {
  logger.info('GmailSyncCron', 'Automated background sync triggered');
  try {
    const supabase = getSupabaseClient();
    const { data: activeAccounts, error } = await supabase
      .from('email_accounts')
      .select('user_id, users(telegram_id)')
      .eq('is_active', true);

    if (error || !activeAccounts) {
      logger.error('GmailSyncCron', 'Failed to fetch active email accounts', error);
      return c.json({ error: 'Failed to fetch active accounts' }, 500);
    }

    logger.info('GmailSyncCron', `Found ${activeAccounts.length} active email account(s) to process`, { count: activeAccounts.length });

    const { syncGmailMessagesForUser } = await import('../../../src/services/gmail.ts');
    let totalProcessed = 0;
    let totalNewReceipts = 0;

    // Process accounts sequentially in background cron to strictly protect Gemini 15 RPM Free Tier quota
    for (const acc of activeAccounts) {
      try {
        const userObj: any = acc.users;
        const telegramId = Array.isArray(userObj) ? userObj[0]?.telegram_id : userObj?.telegram_id;
        const res = await syncGmailMessagesForUser(acc.user_id, telegramId);
        totalProcessed += res.processed;
        totalNewReceipts += res.newReceipts;
      } catch (accErr) {
        logger.error('GmailSyncCron', `Failed syncing account for user ${acc.user_id}`, accErr);
      }
    }

    logger.info('GmailSyncCron', `Finished sync round. Total Processed: ${totalProcessed}, New Receipts: ${totalNewReceipts}`, { totalProcessed, totalNewReceipts });
    return c.json({ ok: true, totalProcessed, totalNewReceipts });
  } catch (err) {
    logger.error('GmailSyncCron', 'Exception in /gmail-sync/process cron endpoint', err);
    return c.json({ error: String(err) }, 500);
  }
});

// Health check endpoint
app.get('/gmail-sync', (c) => {
  return c.text('Gmail Sync Service is Active 🚀');
});

// @ts-ignore Deno.serve export for Supabase Edge Functions
if (typeof Deno !== 'undefined' && Deno.serve) {
  // @ts-ignore
  Deno.serve(app.fetch);
}

export default app;
