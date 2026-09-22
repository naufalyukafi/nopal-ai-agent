import { env } from '../config/env.ts';
import { getBudgetStatus } from '../db/budgets.db.ts';
import { getWIBMonthPeriod } from '../utils/date.ts';
import { logger } from '../utils/logger.ts';

// In-memory cache to prevent spamming notifications on every transaction within the same period
const sentAlertsCache = new Set<string>();

export function clearAlertCacheForTesting() {
  sentAlertsCache.clear();
}

export async function checkAndSendBudgetAlerts(userId: string, chatId: number) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    const budgetStatuses = await getBudgetStatus(userId);
    const currentPeriod = getWIBMonthPeriod();

    for (const status of budgetStatuses) {
      const { categoryId, categoryName, limitAmount, spentAmount, percentageSpent } = status;

      // Only evaluate categories with an active limit
      if (limitAmount <= 0) continue;

      let milestoneToTrigger: 50 | 80 | 100 | null = null;
      let alertMessage: string | null = null;

      if (percentageSpent >= 100) {
        milestoneToTrigger = 100;
        alertMessage = `🚨 *Peringatan Anggaran - Batas Terlampaui (100%+)*\n\nPengeluaran kategori *${categoryName}* telah melebihi limit anggaran!\n\n• Limit: Rp ${limitAmount.toLocaleString('id-ID')}\n• Terpakai: Rp ${spentAmount.toLocaleString('id-ID')} (${percentageSpent}%)`;
      } else if (percentageSpent >= 80) {
        milestoneToTrigger = 80;
        alertMessage = `⚠️ *Peringatan Anggaran - Mendekati Limit (80%+)*\n\nPengeluaran kategori *${categoryName}* sudah mencapai ${percentageSpent}% dari batas limit.\n\n• Limit: Rp ${limitAmount.toLocaleString('id-ID')}\n• Terpakai: Rp ${spentAmount.toLocaleString('id-ID')}\n• Sisa: Rp ${(limitAmount - spentAmount).toLocaleString('id-ID')}`;
      } else if (percentageSpent >= 50) {
        milestoneToTrigger = 50;
        alertMessage = `ℹ️ *Peringatan Anggaran - Setengah Kapasitas (50%+)*\n\nPengeluaran kategori *${categoryName}* telah terpakai ${percentageSpent}% dari limit anggaran.\n\n• Limit: Rp ${limitAmount.toLocaleString('id-ID')}\n• Terpakai: Rp ${spentAmount.toLocaleString('id-ID')}\n• Sisa: Rp ${(limitAmount - spentAmount).toLocaleString('id-ID')}`;
      }

      if (!milestoneToTrigger || !alertMessage) continue;

      const cacheKey = `${userId}:${categoryId || categoryName}:${currentPeriod}:${milestoneToTrigger}`;
      if (sentAlertsCache.has(cacheKey)) {
        // Milestone already notified this period, suppress duplicate spam
        continue;
      }

      // Mark this milestone (and lower milestones) as notified
      sentAlertsCache.add(cacheKey);
      if (milestoneToTrigger >= 80) {
        sentAlertsCache.add(`${userId}:${categoryId || categoryName}:${currentPeriod}:50`);
      }
      if (milestoneToTrigger >= 100) {
        sentAlertsCache.add(`${userId}:${categoryId || categoryName}:${currentPeriod}:80`);
      }

      logger.info('BudgetAlert', `Sending budget milestone alert ${milestoneToTrigger}% for ${categoryName}`, { userId, percentageSpent });

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
  } catch (err) {
    logger.error('BudgetAlert', 'Error checking budget alerts', err, { userId });
  }
}
