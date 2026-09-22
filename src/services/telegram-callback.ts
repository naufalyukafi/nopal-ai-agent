import { env } from '../config/env.ts';
import { confirmTransaction, rejectTransaction, confirmAllPendingTransactions } from '../db/transactions.db.ts';
import { getOrCreateUserByTelegramId } from '../db/users.db.ts';

export async function sendTelegramConfirmationNotification(
  chatId: number,
  transaction: {
    id: string;
    amount: number;
    description?: string;
    categoryName?: string;
    userId?: string;
  }
) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const text = `
*Deteksi Transaksi Email Baru*

Nominal: *Rp ${transaction.amount.toLocaleString('id-ID')}*
Kategori: *${transaction.categoryName || 'Belanja'}*
Deskripsi: _${transaction.description || 'Transaksi Email'}_

Apakah transaksi ini sesuai untuk dicatat?
`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: 'Konfirmasi', callback_data: `confirm_tx_${transaction.id}` },
        { text: 'Bukan Transaksi', callback_data: `reject_tx_${transaction.id}` },
      ],
      [
        { text: 'Konfirmasi Semua Pending', callback_data: 'confirm_all_pending' },
      ],
    ],
  };

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard,
    }),
  });
}

export async function handleTelegramCallbackQuery(callbackQuery: any) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const callbackId = callbackQuery.id;
  const data: string = callbackQuery.data || '';
  const message = callbackQuery.message;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  const fromTelegramId = callbackQuery.from?.id;

  let answerText = 'Diproses';

  try {
    // Authenticate user identity from Telegram callback payload
    let userId: string | undefined = undefined;
    if (fromTelegramId) {
      const user = await getOrCreateUserByTelegramId(
        fromTelegramId,
        callbackQuery.from?.first_name,
        callbackQuery.from?.username
      );
      userId = user.id;
    }

    if (data.startsWith('confirm_tx_')) {
      const txId = data.replace('confirm_tx_', '');
      const tx = await confirmTransaction(txId, userId);
      answerText = 'Transaksi berhasil dikonfirmasi.';

      // Edit original telegram message
      if (botToken && chatId && messageId) {
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `*Transaksi Terkonfirmasi*\nNominal: Rp ${Number(tx.amount).toLocaleString('id-ID')}\nDeskripsi: ${tx.description || '-'}`,
            parse_mode: 'Markdown',
          }),
        });
      }

      // Proactive follow-up message showing updated budget status
      if (botToken && chatId && tx.user_id) {
        try {
          const { getBudgetStatus } = await import('../db/budgets.db.ts');
          const { checkAndSendBudgetAlerts } = await import('./budget-alert.ts');

          const statuses = await getBudgetStatus(tx.user_id);
          const matchedStatus = statuses.find(
            (s) => tx.category_id && s.categoryId === tx.category_id
          ) || statuses.find((s) => s.spentAmount > 0);

          let msg = `Transaksi Rp ${Number(tx.amount).toLocaleString('id-ID')} telah berhasil dicatat ke anggaran.\n\n`;
          if (matchedStatus) {
            if (matchedStatus.limitAmount > 0) {
              msg += `Status Anggaran ${matchedStatus.categoryName}:\n` +
                     `• Limit: Rp ${matchedStatus.limitAmount.toLocaleString('id-ID')}\n` +
                     `• Terpakai: Rp ${matchedStatus.spentAmount.toLocaleString('id-ID')}\n` +
                     `• Sisa: Rp ${matchedStatus.remainingAmount.toLocaleString('id-ID')}`;
            } else {
              msg += `Status Anggaran ${matchedStatus.categoryName}:\n` +
                     `• Total Pengeluaran: Rp ${matchedStatus.spentAmount.toLocaleString('id-ID')} (Belum ada limit)`;
            }
          }

          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: msg,
              parse_mode: 'Markdown',
            }),
          });

          await checkAndSendBudgetAlerts(tx.user_id, chatId);
        } catch (err) {
          console.warn('Failed to send follow-up budget status message:', err);
        }
      }
    } else if (data === 'confirm_all_pending' || data.startsWith('confirm_all_tx_')) {
      if (!userId) {
        throw new Error('User identity could not be resolved from callback query.');
      }

      const count = await confirmAllPendingTransactions(userId);
      answerText = `${count} transaksi berhasil dikonfirmasi.`;

      if (botToken && chatId && messageId) {
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `*Semua Transaksi Pending Terkonfirmasi*\nBerhasil mengonfirmasi ${count} transaksi sekaligus ke dalam anggaran.`,
            parse_mode: 'Markdown',
          }),
        });
      }
    } else if (data.startsWith('reject_tx_')) {
      const txId = data.replace('reject_tx_', '');
      const tx = await rejectTransaction(txId, userId);
      answerText = 'Transaksi dibatalkan.';

      if (botToken && chatId && messageId) {
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `*Transaksi Dibatalkan*\nNominal: Rp ${Number(tx.amount).toLocaleString('id-ID')}`,
            parse_mode: 'Markdown',
          }),
        });
      }
    }

    // Answer callback query so button stops loading indicator
    if (botToken) {
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: answerText,
        }),
      });
    }
  } catch (err) {
    console.error('Error handling callback query:', err);
  }
}
