import { env } from '../config/env.ts';
import { getBudgetStatus } from '../db/budgets.db.ts';

export async function checkAndSendBudgetAlerts(userId: string, chatId: number) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    const budgetStatuses = await getBudgetStatus(userId);

    for (const status of budgetStatuses) {
      const { categoryName, limitAmount, spentAmount, percentageSpent } = status;

      let alertMessage: string | null = null;

      if (percentageSpent >= 100) {
        alertMessage = `Peringatan Anggaran - Batas Terlampaui (100%+)\n\nPengeluaran kategori *${categoryName}* telah melebihi limit anggaran!\n\n• Limit: Rp ${limitAmount.toLocaleString('id-ID')}\n• Terpakai: Rp ${spentAmount.toLocaleString('id-ID')} (${percentageSpent}%)`;
      } else if (percentageSpent >= 80) {
        alertMessage = `Peringatan Anggaran - Mendekati Limit (80%+)\n\nPengeluaran kategori *${categoryName}* sudah mencapai ${percentageSpent}% dari batas limit.\n\n• Limit: Rp ${limitAmount.toLocaleString('id-ID')}\n• Terpakai: Rp ${spentAmount.toLocaleString('id-ID')}\n• Sisa: Rp ${(limitAmount - spentAmount).toLocaleString('id-ID')}`;
      } else if (percentageSpent >= 50) {
        alertMessage = `Peringatan Anggaran - Setengah Kapasitas (50%+)\n\nPengeluaran kategori *${categoryName}* telah terpakai ${percentageSpent}% dari limit anggaran.\n\n• Limit: Rp ${limitAmount.toLocaleString('id-ID')}\n• Terpakai: Rp ${spentAmount.toLocaleString('id-ID')}\n• Sisa: Rp ${(limitAmount - spentAmount).toLocaleString('id-ID')}`;
      }

      if (alertMessage) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: alertMessage,
            parse_mode: 'Markdown',
          }),
        });
      }
    }
  } catch (err) {
    console.error('Error checking budget alerts:', err);
  }
}
