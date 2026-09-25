import { getSmartDailyLimitStatus } from '../db/daily-limit.db.ts';
import { getSupabaseClient } from '../db/supabase.ts';
import { env } from '../config/env.ts';
import { logger } from '../utils/logger.ts';

/**
 * Builds a friendly, motivating morning briefing message with daily limit stats.
 */
export async function formatMorningBriefingMessage(userId: string, firstName?: string): Promise<string> {
  const daily = await getSmartDailyLimitStatus(userId);
  const dateStr = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });

  const greetingName = firstName ? `, ${firstName}` : '';
  const statusIcon = daily.status === 'SAFE' ? '🟢' : daily.status === 'WARNING' ? '🟡' : '🔴';
  const statusDesc = daily.status === 'SAFE' ? 'Aman terkendali' : daily.status === 'WARNING' ? 'Perlu waspada' : 'Melebihi batas ideal';

  let text = `🌅 *Selamat Pagi${greetingName}!* — Pantauan Keuangan Hari Ini\n_${dateStr}_\n\n`;

  if (daily.totalMonthlyBudget > 0) {
    text += `• *Jatah Belanja Operasional Hari Ini:* Rp ${daily.recommendedDailyLimit.toLocaleString('id-ID')}${daily.recommendedDailyLimit === 0 ? ' _(Limit terpakai penuh)_' : ''}\n`;
    text += `• *Terpakai Operasional Harian:* Rp ${daily.todaySpent.toLocaleString('id-ID')}\n`;
    if (daily.todayFixedBillsSpent && daily.todayFixedBillsSpent > 0) {
      text += `• *Tagihan Rutin Terbayar Hari Ini:* Rp ${daily.todayFixedBillsSpent.toLocaleString('id-ID')} _(Tercakup di Budget Bulanan)_\n`;
    }
    text += `• *Sisa Budget Bulan Ini:* Rp ${daily.remainingMonthlyBudget.toLocaleString('id-ID')}\n`;
    text += `• *Sisa Waktu Siklus:* ${daily.remainingDays} hari (s/d ${daily.salaryCycleEnd})\n`;
    text += `• *Status Keuangan:* ${statusDesc} ${statusIcon}\n\n`;

    if (daily.status === 'OVER_LIMIT') {
      text += `💡 _Tips Pemulihan: Anggaran operasional harian telah terlampaui. Tetap semangat! Batasi pengeluaran hanya untuk kebutuhan esensial hari ini. 🛡️_\n\n`;
    } else if (daily.status === 'WARNING') {
      text += `💡 _Tips Waspada: Pengeluaran operasional hari ini mendekati batas limit. Jaga pola pengeluaran agar tetap aman! ⚖️_\n\n`;
    } else {
      text += `💡 _Tips: Keuanganmu berjalan sangat baik hari ini! Catat pengeluaran langsung saat belanja (contoh: \`kopi 25k\`) agar anggaran tetap rapi. ✨_\n\n`;
    }
  } else {
    text += `Belum ada batas anggaran bulanan yang diatur.\nSampaikan alokasi gaji Anda (contoh: "Gaji 7.6jt mau tabung 6jt") agar bot dapat menghitung limit harian otomatis.\n\n`;
  }

  text += `Semangat menjalani hari ini! ✨`;
  return text;
}


/**
 * Iterates through all registered Telegram users and sends them the morning briefing.
 */
export async function sendDailyMorningBriefingToAllUsers(): Promise<{ totalUsers: number; sentCount: number }> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.warn('MorningBriefing', 'TELEGRAM_BOT_TOKEN is missing. Skipping morning briefing.');
    return { totalUsers: 0, sentCount: 0 };
  }

  const supabase = getSupabaseClient();
  const { data: users, error } = await supabase
    .from('users')
    .select('id, telegram_id, first_name')
    .not('telegram_id', 'is', null);

  if (error || !users) {
    logger.error('MorningBriefing', 'Error fetching users for morning briefing', error);
    return { totalUsers: 0, sentCount: 0 };
  }

  let sentCount = 0;
  for (const user of users) {
    if (!user.telegram_id) continue;
    try {
      const msg = await formatMorningBriefingMessage(user.id, user.first_name);
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegram_id,
          text: msg,
          parse_mode: 'Markdown',
        }),
      });

      if (res.ok) {
        sentCount++;
      } else {
        const errTxt = await res.text();
        logger.warn('MorningBriefing', `Failed to send briefing to telegram_id ${user.telegram_id}`, { error: errTxt });
      }

      // Small 150ms delay between messages to respect Telegram broadcast limits
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (userErr) {
      logger.error('MorningBriefing', `Exception sending briefing to user ${user.id}`, userErr);
    }
  }

  logger.info('MorningBriefing', `Finished morning briefing broadcast. Sent: ${sentCount}/${users.length}`);
  return { totalUsers: users.length, sentCount };
}
