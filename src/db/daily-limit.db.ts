import { getSupabaseClient } from './supabase.ts';
import { getUserSalaryCutoffDay } from './users.db.ts';
import { calculateSalaryCycleDateRange } from './budgets.db.ts';
import { getTodayTransactionsSummary } from './transactions.db.ts';
import type { SmartDailyLimitStatus } from '../types/index.ts';
import { logger } from '../utils/logger.ts';

export async function getSmartDailyLimitStatus(
  userId: string,
  referenceDate: Date = new Date()
): Promise<SmartDailyLimitStatus> {
  const supabase = getSupabaseClient();

  // 1. Get salary cutoff day & cycle range
  const cutoffDay = await getUserSalaryCutoffDay(userId);
  const cycle = calculateSalaryCycleDateRange(cutoffDay, referenceDate);

  // 2. Fetch total active monthly budget for user
  const targetPeriod = referenceDate.toISOString().slice(0, 7);
  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('limit_amount, category_id')
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
      .select('limit_amount, category_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const seenCategoryIds = new Set<string>();
    activeBudgets = (latestBudgets || []).filter((b: any) => {
      if (seenCategoryIds.has(b.category_id)) return false;
      seenCategoryIds.add(b.category_id);
      return true;
    });
  }

  const totalMonthlyBudget = activeBudgets.reduce(
    (sum: number, b: any) => sum + Number(b.limit_amount || 0),
    0
  );

  // 3. Fetch total confirmed transactions in current salary cycle
  const { data: cycleTxs, error: txError } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .gte('transaction_date', cycle.startDate)
    .lte('transaction_date', cycle.endDate);

  if (txError) {
    logger.error('DB:DailyLimit', 'Error fetching cycle transactions for daily limit', txError, { userId, cycle });
  }

  const cycleSpent = (cycleTxs || []).reduce(
    (sum: number, t: any) => sum + Number(t.amount || 0),
    0
  );

  // 4. Fetch today's confirmed spending summary
  const todaySummary = await getTodayTransactionsSummary(userId);
  const todaySpent = todaySummary.totalSpent;

  // 5. Calculate remaining days & total days in cycle
  const cycleStart = new Date(cycle.startDate);
  const cycleEnd = new Date(cycle.endDate);
  const todayStart = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), 0, 0, 0)
  );
  const cycleEndDay = new Date(
    Date.UTC(cycleEnd.getUTCFullYear(), cycleEnd.getUTCMonth(), cycleEnd.getUTCDate(), 23, 59, 59, 999)
  );

  const totalCycleMs = cycleEndDay.getTime() - cycleStart.getTime();
  const totalDaysInCycle = Math.max(1, Math.ceil(totalCycleMs / (1000 * 60 * 60 * 24)));

  const diffMs = cycleEndDay.getTime() - todayStart.getTime();
  const remainingDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // 6. Calculate realistic daily limit (Baseline vs Dynamic Pace)
  const remainingMonthlyBudget = Math.max(0, totalMonthlyBudget - cycleSpent);
  const availableBudgetForRemainder = Math.max(0, totalMonthlyBudget - (cycleSpent - todaySpent));

  const baselineDailyLimit = totalMonthlyBudget > 0 ? Math.floor(totalMonthlyBudget / totalDaysInCycle) : 0;
  const dynamicDailyLimit = totalMonthlyBudget > 0 ? Math.floor(availableBudgetForRemainder / remainingDays) : 0;

  // Realism normalization: if dynamic limit is artificially inflated because of few remaining days, cap at baseline
  let recommendedDailyLimit = dynamicDailyLimit;
  if (baselineDailyLimit > 0 && dynamicDailyLimit > baselineDailyLimit * 1.25) {
    recommendedDailyLimit = baselineDailyLimit;
  }

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
