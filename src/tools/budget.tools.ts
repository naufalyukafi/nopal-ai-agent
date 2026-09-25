import { setCategoryBudget, getBudgetStatus } from '../db/budgets.db.ts';
import { updateUserSalaryCutoffDay, getUserSalaryCutoffDay } from '../db/users.db.ts';
import { getSmartDailyLimitStatus } from '../db/daily-limit.db.ts';

export const budgetToolDeclarations = [
  {
    name: 'set_category_budget',
    description: 'Set or update the monthly spending limit for a specific category.',
    parameters: {
      type: 'OBJECT',
      properties: {
        categoryName: {
          type: 'STRING',
          description: 'Category name for the budget, e.g. "Transportasi", "Makanan & Minuman".',
        },
        limitAmount: {
          type: 'NUMBER',
          description: 'Maximum budget limit in IDR (e.g. 500000).',
        },
        period: {
          type: 'STRING',
          description: 'Budget period format YYYY-MM (default: current month, e.g. "2026-09").',
        },
      },
      required: ['categoryName', 'limitAmount'],
    },
  },
  {
    name: 'check_budget_status',
    description: 'Check remaining budget and percentage of budget spent per category for the current month.',
    parameters: {
      type: 'OBJECT',
      properties: {
        period: {
          type: 'STRING',
          description: 'Budget period format YYYY-MM (default: current month).',
        },
      },
    },
  },
  {
    name: 'get_smart_daily_limit',
    description: 'Get smart dynamic daily limit status (safe-to-spend today, remaining daily limit, progress bar, and health status).',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'set_salary_date',
    description: 'Set or update user salary cutoff date (e.g. 25 for salary received on the 25th of every month).',
    parameters: {
      type: 'OBJECT',
      properties: {
        cutoffDay: {
          type: 'NUMBER',
          description: 'Day of month when salary is received or budget resets (1-31, e.g. 25).',
        },
      },
      required: ['cutoffDay'],
    },
  },
];

export async function executeBudgetTool(toolName: string, args: Record<string, any>, userId: string) {
  if (toolName === 'set_category_budget') {
    const budget = await setCategoryBudget({
      userId,
      categoryName: args.categoryName,
      limitAmount: Number(args.limitAmount),
      period: args.period,
    });
    return {
      success: true,
      message: `Budget untuk kategori ${args.categoryName} berhasil diatur sebesar Rp ${Number(budget.limit_amount).toLocaleString('id-ID')}/bulan.`,
      data: budget,
    };
  }

  if (toolName === 'check_budget_status') {
    const statusList = await getBudgetStatus(userId, args.period);
    const cutoffDay = await getUserSalaryCutoffDay(userId);
    return {
      success: true,
      message: `Status anggaran berhasil diambil (Siklus gajian tanggal ${cutoffDay}). Total ${statusList.length} kategori budget aktif.`,
      data: { cutoffDay, statusList },
    };
  }

  if (toolName === 'get_smart_daily_limit') {
    const dailyStatus = await getSmartDailyLimitStatus(userId);
    let extraInfo = '';
    if (dailyStatus.todayFixedBillsSpent && dailyStatus.todayFixedBillsSpent > 0) {
      extraInfo = ` Transaksi Tagihan Rutin Terbayar Hari Ini: Rp ${dailyStatus.todayFixedBillsSpent.toLocaleString('id-ID')} (tercakup dalam budget bulanan).`;
    }
    return {
      success: true,
      message: `Status limit harian operasional berhasil diambil. Batas aman hari ini: Rp ${dailyStatus.recommendedDailyLimit.toLocaleString('id-ID')}, Terpakai operasional: Rp ${dailyStatus.todaySpent.toLocaleString('id-ID')}, Sisa limit harian: Rp ${dailyStatus.todayRemainingLimit.toLocaleString('id-ID')}.${extraInfo} Status: ${dailyStatus.status}.`,
      data: dailyStatus,
    };
  }

  if (toolName === 'set_salary_date') {
    const day = Math.min(31, Math.max(1, Math.round(Number(args.cutoffDay))));
    await updateUserSalaryCutoffDay(userId, day);
    return {
      success: true,
      message: `Tanggal gajian & riset anggaran berhasil diatur ke tanggal ${day} setiap bulannya. Perhitungan budget Anda sekarang otomatis dihitung dari tanggal ${day} s/d tanggal ${day - 1 === 0 ? 31 : day - 1} bulan berikutnya.`,
      data: { cutoffDay: day },
    };
  }

  throw new Error(`Unknown budget tool: ${toolName}`);
}

