import { Hono } from 'hono';
import { getOrCreateUserByTelegramId } from '../../../src/db/users.db.ts';
import { getSupabaseClient } from '../../../src/db/supabase.ts';
import { processAgentMessage } from '../../../src/agent/gemini.ts';
import { handleTelegramCallbackQuery } from '../../../src/services/telegram-callback.ts';
import { checkAndSendBudgetAlerts } from '../../../src/services/budget-alert.ts';
import { env } from '../../../src/config/env.ts';
import { logger } from '../../../src/utils/logger.ts';

declare const EdgeRuntime: any;

const app = new Hono();

const DEFAULT_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: 'Pengeluaran Hari Ini' }, { text: 'Status Budget' }],
    [{ text: 'Riwayat Transaksi' }, { text: 'Sync Gmail' }],
    [{ text: 'Hubungkan Email' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

let isCommandsRegistered = false;
async function ensureBotCommandsRegistered() {
  if (isCommandsRegistered) return;
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'today', description: 'Total & rincian pengeluaran hari ini' },
          { command: 'budget', description: 'Status limit anggaran bulan ini' },
          { command: 'transaksi', description: 'Riwayat 5 transaksi terakhir' },
          { command: 'sync', description: 'Sinkronisasi email transaksi Gmail' },
          { command: 'email', description: 'Tautan otorisasi akun Gmail' },
          { command: 'help', description: 'Menu bantuan dan petunjuk' },
        ],
      }),
    });
    isCommandsRegistered = true;
  } catch (err) {
    logger.warn('TelegramWebhook', 'Failed to register bot commands', { error: String(err) });
  }
}

// Helper to send message back to Telegram
async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.warn('TelegramWebhook', 'TELEGRAM_BOT_TOKEN is missing. Cannot send response to Telegram.');
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup !== undefined ? replyMarkup : DEFAULT_REPLY_KEYBOARD,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error('TelegramWebhook', `Failed API response from Telegram sendMessage: ${res.status}`, new Error(errText), { chatId });
    }
  } catch (err) {
    logger.error('TelegramWebhook', 'Exception while sending Telegram message', err, { chatId });
  }
}

// Telegram Webhook POST Handler
app.post('/telegram-webhook', async (c) => {
  try {
    // SECURITY GUARD: Verify secret token header if TELEGRAM_SECRET_TOKEN is configured
    const expectedSecret = env.TELEGRAM_SECRET_TOKEN;
    if (expectedSecret) {
      const receivedSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
      if (receivedSecret !== expectedSecret) {
        logger.warn('TelegramWebhook', 'Unauthorized webhook call: invalid secret token header');
        return c.text('Unauthorized', 401);
      }
    }

    const payload = await c.req.json();
    logger.debug('TelegramWebhook', 'Received webhook payload', { payload });

    // Handle Inline Keyboard Callback Queries (Human-in-the-Loop)
    if (payload.callback_query) {
      logger.info('TelegramWebhook', 'Processing Inline Keyboard callback query', { callbackId: payload.callback_query.id });
      await handleTelegramCallbackQuery(payload.callback_query);
      return c.json({ ok: true });
    }

    const message = payload.message;
    if (!message || !message.from || !message.text) {
      logger.debug('TelegramWebhook', 'Non-text update received, acknowledging OK');
      return c.json({ ok: true });
    }

    const telegramId = message.from.id;
    const chatId = message.chat.id;
    const userText = message.text;
    const firstName = message.from.first_name;
    const username = message.from.username;

    logger.info('TelegramWebhook', `Incoming message from Telegram user ${telegramId}`, { username, text: userText });

    // 1. Resolve or create user in DB
    const user = await getOrCreateUserByTelegramId(telegramId, firstName, username);

    const trimmedText = userText.trim();
    const lowerText = trimmedText.toLowerCase();

    // OPTIMIZATION: Handle static commands (/start, /help) instantly without hitting Gemini API
    if (lowerText === '/start' || lowerText === 'start' || lowerText === '/help') {
      const fastTask = async () => {
        try {
          await ensureBotCommandsRegistered();
          const supabase = getSupabaseClient();
          const { data: connectedEmails } = await supabase
            .from('email_accounts')
            .select('email')
            .eq('user_id', user.id)
            .eq('is_active', true);

          const emailList = (connectedEmails || []).map((e: any) => e.email);
          let emailStatusText = '';
          if (emailList.length > 0) {
            emailStatusText = `• Gmail Terhubung: ${emailList.join(', ')}\n  (Tekan "Hubungkan Email" jika ingin menautkan akun Gmail tambahan)`;
          } else {
            emailStatusText = `• Integrasi Gmail: Tekan "Hubungkan Email" untuk menautkan akun Gmail Anda`;
          }

          const cutoffInfo = user.salary_cutoff_day && user.salary_cutoff_day > 1
            ? `• Siklus Gajian: Tanggal ${user.salary_cutoff_day} setiap bulannya`
            : `• Siklus Gajian: Tanggal 1 (Sampaikan "Gajianku tanggal 25" jika gajian Anda tanggal 25)`;

          const welcomeText = `Nopal Agent - Layanan Asisten Keuangan

Menu Utama:
• Status Budget - Cek limit dan sisa anggaran bulan ini
• Riwayat Transaksi - Lihat 5 transaksi terakhir
• Sync Gmail - Sinkronisasi kuitansi email instan
• Hubungkan Email - Tautan otorisasi akun Gmail
${emailStatusText}
${cutoffInfo}

Silakan gunakan tombol menu di bawah atau sampaikan instruksi Anda.`;

          await sendTelegramMessage(chatId, welcomeText);
        } catch (err) {
          logger.error('TelegramWebhook', 'Error handling /start command', err);
          await sendTelegramMessage(chatId, 'Nopal Agent - Layanan Asisten Keuangan\n\nSilakan sampaikan instruksi atau pertanyaan keuangan Anda.');
        }
      };

      // @ts-ignore
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(fastTask());
      } else {
        fastTask();
      }

      return c.json({ ok: true, status: 'fast_command' });
    }

    // FAST ROUTE 2: Direct Gmail Auth Link without Gemini LLM
    if (lowerText === 'hubungkan email' || lowerText === '/email' || lowerText === 'connect gmail') {
      const supabaseUrl = env.SUPABASE_URL || 'https://pobbqgnckilmqmrpiaod.supabase.co';
      const authUrl = `${supabaseUrl}/functions/v1/gmail-sync/auth?userId=${user.id}`;
      const msg = `Tautan Otorisasi Integrasi Gmail\n\nSilakan buka tautan berikut untuk menautkan akun Gmail Anda:\n${authUrl}`;
      const fastTask = async () => {
        await sendTelegramMessage(chatId, msg);
      };
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(fastTask());
      } else {
        fastTask();
      }
      return c.json({ ok: true, status: 'fast_gmail_link' });
    }

    // FAST ROUTE 2.5: Direct Today's Spending from DB without Gemini LLM
    if (
      lowerText === '/today' ||
      lowerText === '/hari_ini' ||
      lowerText === 'pengeluaran hari ini' ||
      lowerText === 'total hari ini' ||
      lowerText === 'hari ini'
    ) {
      const fastTask = async () => {
        try {
          const { getTodayTransactionsSummary } = await import('../../../src/db/transactions.db.ts');
          const today = await getTodayTransactionsSummary(user.id);
          const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

          if (today.count === 0) {
            await sendTelegramMessage(
              chatId,
              `📊 *Pengeluaran Hari Ini (${dateStr})*\n\nBelum ada pengeluaran yang dicatat untuk hari ini.`
            );
            return;
          }

          let text = `📊 *Pengeluaran Hari Ini (${dateStr})*\n\n`;
          text += `• Total Terpakai: *Rp ${today.totalSpent.toLocaleString('id-ID')}* (${today.count} transaksi)\n\n`;
          text += `Rincian Transaksi:\n`;
          today.transactions.forEach((tx, i) => {
            text += `${i + 1}. Rp ${tx.amount.toLocaleString('id-ID')} (${tx.categoryName})\n   ${tx.description} • ${tx.time}\n\n`;
          });

          await sendTelegramMessage(chatId, text);
        } catch (err) {
          logger.error('TelegramWebhook', 'Error fetching today spending fast route', err);
          await sendTelegramMessage(chatId, 'Gagal mengambil pengeluaran hari ini.');
        }
      };
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(fastTask());
      } else {
        fastTask();
      }
      return c.json({ ok: true, status: 'fast_today_spending' });
    }

    // FAST ROUTE 3: Direct Recent Transactions from DB without Gemini LLM
    if (lowerText === '/transaksi' || lowerText === '/riwayat' || lowerText === 'riwayat' || lowerText === 'riwayat transaksi') {
      const fastTask = async () => {
        try {
          const { getRecentTransactions, getPendingTransactions } = await import('../../../src/db/transactions.db.ts');
          const txs = await getRecentTransactions(user.id, 5);
          const pendingTxs = await getPendingTransactions(user.id);

          if (txs.length === 0 && pendingTxs.length === 0) {
            await sendTelegramMessage(chatId, 'Belum ada transaksi yang dicatat. Tekan "Sync Gmail" atau ketik pengeluaran Anda.');
            return;
          }

          let text = 'Daftar Transaksi Terakhir\n\n';
          if (txs.length > 0) {
            txs.forEach((tx: any, i: number) => {
              const dateStr = new Date(tx.transaction_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
              // @ts-ignore
              const catName = tx.categories?.name || 'Lain-lain';
              const srcLabel = tx.source === 'gmail' ? ' [Gmail]' : '';
              text += `${i + 1}. Rp ${Number(tx.amount).toLocaleString('id-ID')} (${catName})${srcLabel}\n   ${tx.description || 'Tanpa keterangan'} • ${dateStr}\n\n`;
            });
          }

          if (pendingTxs.length > 0) {
            text += `Menunggu Konfirmasi Email (${pendingTxs.length} transaksi):\n`;
            pendingTxs.forEach((pTx: any) => {
              text += `• Rp ${Number(pTx.amount).toLocaleString('id-ID')} - ${pTx.description || 'Transaksi Email'}\n`;
            });
          }

          await sendTelegramMessage(chatId, text);
        } catch (err) {
          logger.error('TelegramWebhook', 'Error fetching recent transactions fast route', err);
          await sendTelegramMessage(chatId, 'Gagal mengambil riwayat transaksi.');
        }
      };
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(fastTask());
      } else {
        fastTask();
      }
      return c.json({ ok: true, status: 'fast_transactions' });
    }

    // FAST ROUTE 4: Direct Budget Status from DB without Gemini LLM
    if (lowerText === '/budget' || lowerText === '/limit' || lowerText === 'cek budget' || lowerText === 'status budget') {
      const fastTask = async () => {
        try {
          const { getBudgetStatus } = await import('../../../src/db/budgets.db.ts');
          const statusList = await getBudgetStatus(user.id);
          if (statusList.length === 0) {
            await sendTelegramMessage(chatId, 'Belum ada limit anggaran yang diatur. Silakan sampaikan alokasi gaji Anda (contoh: "Gaji 7.6jt mau tabung 6jt") untuk mengatur limit otomatis.');
            return;
          }
          let text = 'Status Limit Anggaran Bulan Ini\n\n';
          statusList.forEach((b: any) => {
            const spent = Number(b.spentAmount || 0);
            const limit = Number(b.limitAmount || 0);
            const remaining = Number(b.remainingAmount || 0);
            const pct = Math.min(Math.round(b.percentageSpent || 0), 100);
            if (limit > 0) {
              text += `• ${b.categoryName}\n  ` +
                      `Pengeluaran: Rp ${spent.toLocaleString('id-ID')} / Rp ${limit.toLocaleString('id-ID')}\n  ` +
                      `Sisa: Rp ${remaining.toLocaleString('id-ID')} (${pct}% terpakai)\n\n`;
            } else {
              text += `• ${b.categoryName}\n  ` +
                      `Pengeluaran: Rp ${spent.toLocaleString('id-ID')} (Belum ada limit)\n\n`;
            }
          });
          await sendTelegramMessage(chatId, text);
        } catch (err) {
          logger.error('TelegramWebhook', 'Error fetching budget status fast route', err);
          await sendTelegramMessage(chatId, 'Gagal mengambil status anggaran.');
        }
      };
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(fastTask());
      } else {
        fastTask();
      }
      return c.json({ ok: true, status: 'fast_budget' });
    }

    // FAST ROUTE 5: Direct Batch Confirm All Pending Transactions
    if (lowerText === '/confirm_all' || lowerText === '/setujui_semua' || lowerText === 'konfirmasi semua' || lowerText === 'setujui semua' || lowerText === 'approve all') {
      const fastTask = async () => {
        try {
          const { confirmAllPendingTransactions } = await import('../../../src/db/transactions.db.ts');
          const count = await confirmAllPendingTransactions(user.id);
          if (count === 0) {
            await sendTelegramMessage(chatId, 'Tidak ada transaksi tertunda yang perlu dikonfirmasi saat ini.');
          } else {
            await sendTelegramMessage(chatId, `Berhasil mengonfirmasi ${count} transaksi tertunda sekaligus ke dalam anggaran.`);
          }
        } catch (err) {
          logger.error('TelegramWebhook', 'Error batch confirming transactions fast route', err);
          await sendTelegramMessage(chatId, 'Gagal mengonfirmasi transaksi.');
        }
      };
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(fastTask());
      } else {
        fastTask();
      }
      return c.json({ ok: true, status: 'fast_confirm_all' });
    }

    // FAST ROUTE 5: Direct Gmail Manual Sync Trigger
    if (lowerText === '/sync' || lowerText === '/sync_gmail' || lowerText === 'sync email' || lowerText === 'cek email' || lowerText === 'sync gmail') {
      const fastTask = async () => {
        try {
          await sendTelegramMessage(chatId, 'Memulai sinkronisasi email Gmail terbaru Anda...');

          const { syncGmailMessagesForUser } = await import('../../../src/services/gmail.ts');
          const result = await syncGmailMessagesForUser(user.id, chatId);

          if (result.noAccounts) {
            await sendTelegramMessage(
              chatId,
              '⚠️ *Belum Ada Akun Gmail Terhubung*\n\nAnda belum menautkan akun Gmail ke Nopal Agent. Silakan tekan tombol "Hubungkan Email" untuk menautkan akun Anda.'
            );
            return;
          }

          const accountsLabel = result.accountEmails.join(', ');

          if (result.errors && result.errors.length > 0 && result.processed === 0 && result.newReceipts === 0) {
            await sendTelegramMessage(
              chatId,
              `❌ *Sinkronisasi Gmail Gagal*\n\n• Akun: \`${accountsLabel}\`\n• Kendala: ${result.errors.join('; ')}\n\nSilakan coba tekan "Hubungkan Email" jika perlu menghubungkan ulang akun Anda.`
            );
            return;
          }

          let detailText = '';
          if (result.newReceipts > 0) {
            detailText = `Berhasil menemukan dan mencatat *${result.newReceipts} kuitansi baru* dari ${result.processed} email yang diperiksa!`;
          } else if (result.processed > 0) {
            detailText = `Diperiksa ${result.processed} email baru, namun tidak ditemukan kuitansi pengeluaran baru.`;
          } else {
            detailText = `Semua email transaksi sudah tersinkronisasi. Tidak ada kuitansi baru yang masuk sejak sinkronisasi terakhir.`;
          }

          const message = `✅ *Sinkronisasi Gmail Berhasil*\n\n• Akun Terhubung: \`${accountsLabel}\`\n• Transaksi Baru: ${result.newReceipts}\n\n${detailText}`;
          await sendTelegramMessage(chatId, message);
        } catch (err) {
          logger.error('TelegramWebhook', 'Error executing manual Gmail sync', err);
          await sendTelegramMessage(chatId, '❌ *Sinkronisasi Gmail Gagal*\n\nTerjadi kesalahan koneksi. Silakan coba beberapa saat lagi.');
        }
      };
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(fastTask());
      } else {
        fastTask();
      }
      return c.json({ ok: true, status: 'fast_gmail_sync' });
    }

    // 2. Trigger async background processing for AI requests
    const backgroundTask = async () => {
      try {
        const replyText = await processAgentMessage(user.id, userText);
        await sendTelegramMessage(chatId, replyText);

        // Check budget limits and send proactive alert if 80%+ or 100%+ limit reached
        await checkAndSendBudgetAlerts(user.id, chatId);
      } catch (err) {
        logger.error('TelegramWebhook', 'Error processing background agent loop', err, { userId: user.id, chatId });
        await sendTelegramMessage(chatId, 'Maaf, terjadi kesalahan saat memproses pesan Anda.');
      }
    };

    // @ts-ignore EdgeRuntime.waitUntil if running in Deno Edge Runtime
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundTask());
    } else {
      // Fallback for non-EdgeRuntime environments
      backgroundTask();
    }

    // 3. Fast response < 2 seconds to avoid Telegram retries
    return c.json({ ok: true, status: 'processing' });
  } catch (err) {
    logger.error('TelegramWebhook', 'Critical exception in Telegram Webhook Handler', err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Health check endpoint
app.get('/telegram-webhook', (c) => {
  return c.text('Telegram Webhook Service is Active 🚀');
});

// @ts-ignore Deno.serve export for Supabase Edge Functions
if (typeof Deno !== 'undefined' && Deno.serve) {
  // @ts-ignore
  Deno.serve(app.fetch);
}

export default app;
