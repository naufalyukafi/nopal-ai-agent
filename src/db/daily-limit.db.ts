import { getSupabaseClient } from './supabase.ts';
import { getUserSalaryCutoffDay } from './users.db.ts';
import { calculateSalaryCycleDateRange } from './budgets.db.ts';
import { getTodayTransactionsSummary } from './transactions.db.ts';
import type { SmartDailyLimitStatus } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { getWIBStartOfDay } from '../utils/date.ts';

export function isSavingsCategory(catName?: string): boolean {
  if (!catName) return false;
  return /tabungan|investasi|savings|deposito|dana darurat|reksa dana|portfolio/i.test(catName.trim());
}

export async function getSmartDailyLimitStatus(
  userId: string,
  referenceDate: Date = new Date()
): Promise<SmartDailyLimitStatus> {
  const supabase = getSupabaseClient();

  // 1. Get salary cutoff day & cycle range
  const cutoffDay = await getUserSalaryCutoffDay(userId);
  const cycle = calculateSalaryCycleDateRange(cutoffDay, referenceDate);

  // 2. Fetch total active monthly budget for user (excluding Savings / Tabungan categories)
  // Consistently uses canonical cycleMonthPeriod so the cycle's budget doesn't flip halfway through
  const targetPeriod = cycle.cycleMonthPeriod;
  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('limit_amount, category_id, categories(name)')
    .eq('user_id', userId)
    .eq('period', targetPeriod);

  if (budgetError) {
    logger.error('DB:DailyLimit', 'Error fetching budgets for daily limit', budgetError, { userId, targetPeriod });
  }

  let activeBudgets = budgets || [];
  if (activeBudgets.length === 0) {
    // Fallback to latest configured budget per category
    const { data: latestBudgets } = await supabase
      .from('budgets')
      .select('limit_amount, category_id, categories(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const seenCategoryIds = new Set<string>();
    activeBudgets = (latestBudgets || []).filter((b: any) => {
      if (seenCategoryIds.has(b.category_id)) return false;
      seenCategoryIds.add(b.category_id);
      return true;
    });
  }

  // Filter out Savings categories so daily limit only reflects operational living expenses
  const operationalBudgets = activeBudgets.filter(
    (b: any) => !isSavingsCategory(b.categories?.name)
  );

  const totalMonthlyBudgetCents = operationalBudgets.reduce(
    (sum: number, b: any) => sum + Math.round(Number(b.limit_amount || 0) * 100),
    0
  );
  const totalMonthlyBudget = Math.round(totalMonthlyBudgetCents) / 100;

  // 3. Fetch total confirmed transactions in current salary cycle
  const { data: cycleTxs, error: txError } = await supabase
    .from('transactions')
    .select('amount, categories(name)')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .gte('transaction_date', cycle.startDate)
    .lte('transaction_date', cycle.endDate);

  if (txError) {
    logger.error('DB:DailyLimit', 'Error fetching cycle transactions for daily limit', txError, { userId, cycle });
  }

  // Filter out confirmed transactions under Savings categories using cent math
  const cycleSpentCents = (cycleTxs || []).reduce((sum: number, t: any) => {
    if (isSavingsCategory(t.categories?.name)) return sum;
    return sum + Math.round(Number(t.amount || 0) * 100);
  }, 0);
  const cycleSpent = Math.round(cycleSpentCents) / 100;

  // 4. Fetch today's confirmed spending summary using WIB boundaries
  const todaySummary = await getTodayTransactionsSummary(userId, referenceDate);
  const todaySpent = todaySummary.totalSpent;

  // 5. Calculate remaining days & total days in cycle accurately in WIB
  const cycleStart = new Date(cycle.startDate);
  const cycleEnd = new Date(cycle.endDate);
  const todayStart = getWIBStartOfDay(referenceDate);

  const totalCycleMs = cycleEnd.getTime() - cycleStart.getTime();
  const totalDaysInCycle = Math.max(1, Math.round(totalCycleMs / (1000 * 60 * 60 * 24)));

  const diffMs = cycleEnd.getTime() - todayStart.getTime();
  const remainingDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // 6. Calculate realistic daily limit (Baseline vs Dynamic Pace)
  const remainingMonthlyBudget = Math.max(0, totalMonthlyBudget - cycleSpent);
  const availableBudgetForRemainder = Math.max(0, totalMonthlyBudget - (cycleSpent - todaySpent));

  const baselineDailyLimit = totalMonthlyBudget > 0 ? Math.floor(totalMonthlyBudget / totalDaysInCycle) : 0;
  const dynamicDailyLimit = totalMonthlyBudget > 0 ? Math.floor(availableBudgetForRemainder / remainingDays) : 0;

  // Honest dynamic limit calculation: rewards early savings and reflects actual remaining runway
  const recommendedDailyLimit = dynamicDailyLimit;
  const todayRemainingLimit = recommendedDailyLimit - todaySpent;

  // 7. Calculate status & clean progress indicator
  let percentageSpentToday = 0;
  if (recommendedDailyLimit > 0) {
    percentageSpentToday = Math.min(100, Math.round((todaySpent / recommendedDailyLimit) * 100));
  } else if (todaySpent > 0) {
    percentageSpentToday = 100;
  }

  const progressBar = `${percentageSpentToday}% terpakai`;

  let status: 'SAFE' | 'WARNING' | 'OVER_LIMIT' = 'SAFE';
  if (recommendedDailyLimit > 0) {
    if (todaySpent > 1.5 * recommendedDailyLimit) {
      status = 'OVER_LIMIT';
    } else if (todaySpent > recommendedDailyLimit) {
      status = 'WARNING';
    }
  } else if (todaySpent > 0) {
    status = 'OVER_LIMIT';
  }

  const cycleEndDateObj = new Date(cycle.endDate);
  const salaryCycleEnd = cycleEndDateObj.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });

  return {
    recommendedDailyLimit,
    todaySpent,
    todayRemainingLimit,
    remainingDays,
    totalMonthlyBudget,
    remainingMonthlyBudget,
    percentageSpentToday,
    status,
    progressBar,
    salaryCycleEnd,
  };
}
