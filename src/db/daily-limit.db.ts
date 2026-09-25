import { getSupabaseClient } from './supabase.ts';
import { getUserSalaryCutoffDay } from './users.db.ts';
import { calculateSalaryCycleDateRange } from './budgets.db.ts';
import { getTodayTransactionsSummary } from './transactions.db.ts';
import type { SmartDailyLimitStatus } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { getWIBStartOfDay } from '../utils/date.ts';

export function isSavingsCategory(catName?: string, catType?: string): boolean {
  if (catType === 'savings') return true;
  if (catType === 'operational' || catType === 'fixed_bill') return false;
  if (!catName) return false;
  return /tabungan|investasi|savings|deposito|dana darurat|reksa dana|portfolio/i.test(catName.trim());
}

export function isFixedBillCategory(catName?: string, catType?: string): boolean {
  if (catType === 'fixed_bill') return true;
  if (catType === 'operational' || catType === 'savings') return false;
  if (!catName) return false;
  return /internet|komunikasi|telepon|pulsa|paket data|wifi|indihome|biznet|indosat|telkomsel|xl|tri|smartfren|listrik|pln|air|pdam|sewa|kos|kost|kontrakan|kpr|cicilan|asuransi|bpjs|pajak|tagihan|utilitas|laundry|subskripsi|subscription|netflix|spotify|youtube/i.test(catName.trim());
}

export async function getSmartDailyLimitStatus(
  userId: string,
  referenceDate: Date = new Date()
): Promise<SmartDailyLimitStatus> {
  const supabase = getSupabaseClient();

  // 1. Get salary cutoff day & cycle range
  const cutoffDay = await getUserSalaryCutoffDay(userId);
  const cycle = calculateSalaryCycleDateRange(cutoffDay, referenceDate);

  // 2. Fetch total active monthly budget for user (selecting name and explicit type)
  const targetPeriod = cycle.cycleMonthPeriod;
  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('limit_amount, category_id, categories(name, type)')
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
      .select('limit_amount, category_id, categories(name, type)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const seenCategoryIds = new Set<string>();
    activeBudgets = (latestBudgets || []).filter((b: any) => {
      if (seenCategoryIds.has(b.category_id)) return false;
      seenCategoryIds.add(b.category_id);
      return true;
    });
  }

  // Filter ONLY operational budgets for daily limit allowance
  const operationalBudgets = activeBudgets.filter(
    (b: any) => !isSavingsCategory(b.categories?.name, b.categories?.type) && !isFixedBillCategory(b.categories?.name, b.categories?.type)
  );

  const totalMonthlyBudgetCents = operationalBudgets.reduce(
    (sum: number, b: any) => sum + Math.round(Number(b.limit_amount || 0) * 100),
    0
  );
  const totalMonthlyBudget = Math.round(totalMonthlyBudgetCents) / 100;

  // Filter fixed bill budgets for structured overview
  const fixedBillBudgets = activeBudgets.filter(
    (b: any) => isFixedBillCategory(b.categories?.name, b.categories?.type)
  );

  const totalFixedBillsBudgetCents = fixedBillBudgets.reduce(
    (sum: number, b: any) => sum + Math.round(Number(b.limit_amount || 0) * 100),
    0
  );
  const totalFixedBillsBudget = Math.round(totalFixedBillsBudgetCents) / 100;

  // 3. Fetch total confirmed transactions in current salary cycle
  const { data: cycleTxs, error: txError } = await supabase
    .from('transactions')
    .select('amount, categories(name, type)')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .gte('transaction_date', cycle.startDate)
    .lte('transaction_date', cycle.endDate);

  if (txError) {
    logger.error('DB:DailyLimit', 'Error fetching cycle transactions for daily limit', txError, { userId, cycle });
  }

  // Calculate operational spent vs fixed bill spent in current cycle
  let cycleOperationalCents = 0;
  let cycleFixedBillsCents = 0;

  for (const t of cycleTxs || []) {
    const amtCents = Math.round(Number(t.amount || 0) * 100);
    const cat = (Array.isArray(t.categories) ? t.categories[0] : t.categories) as any;
    if (isSavingsCategory(cat?.name, cat?.type)) {
      continue;
    }
    if (isFixedBillCategory(cat?.name, cat?.type)) {
      cycleFixedBillsCents += amtCents;
    } else {
      cycleOperationalCents += amtCents;
    }
  }

  const cycleOperationalSpent = Math.round(cycleOperationalCents) / 100;
  const cycleFixedBillsSpent = Math.round(cycleFixedBillsCents) / 100;

  // 4. Fetch today's confirmed spending summary using WIB boundaries
  const todaySummary = await getTodayTransactionsSummary(userId, referenceDate);
  
  let todayOperationalCents = 0;
  let todayFixedBillsCents = 0;
  let fixedBillsCountToday = 0;

  for (const t of todaySummary.transactions) {
    const amtCents = Math.round(Number(t.amount || 0) * 100);
    if (isSavingsCategory(t.categoryName)) {
      continue;
    }
    if (isFixedBillCategory(t.categoryName)) {
      todayFixedBillsCents += amtCents;
      fixedBillsCountToday++;
    } else {
      todayOperationalCents += amtCents;
    }
  }

  const todaySpent = Math.round(todayOperationalCents) / 100;
  const todayFixedBillsSpent = Math.round(todayFixedBillsCents) / 100;
  const todayTotalSpentWithBills = Math.round(todayOperationalCents + todayFixedBillsCents) / 100;

  // 5. Calculate remaining days & total days in cycle accurately in WIB
  const cycleStart = new Date(cycle.startDate);
  const cycleEnd = new Date(cycle.endDate);
  const todayStart = getWIBStartOfDay(referenceDate);

  const totalCycleMs = cycleEnd.getTime() - cycleStart.getTime();
  const totalDaysInCycle = Math.max(1, Math.round(totalCycleMs / (1000 * 60 * 60 * 24)));

  const diffMs = cycleEnd.getTime() - todayStart.getTime();
  const remainingDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // 6. Calculate realistic daily limit (Baseline vs Dynamic Pace based on OPERATIONAL budget only)
  const remainingMonthlyBudget = Math.max(0, totalMonthlyBudget - cycleOperationalSpent);
  const availableBudgetForRemainder = Math.max(0, totalMonthlyBudget - (cycleOperationalSpent - todaySpent));

  const baselineDailyLimit = totalMonthlyBudget > 0 ? Math.floor(totalMonthlyBudget / totalDaysInCycle) : 0;
  const dynamicDailyLimit = totalMonthlyBudget > 0 ? Math.floor(availableBudgetForRemainder / remainingDays) : 0;

  const recommendedDailyLimit = dynamicDailyLimit;
  const todayRemainingLimit = recommendedDailyLimit - todaySpent;

  // 7. Calculate status & clean progress indicator based on OPERATIONAL daily spent
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
    todayFixedBillsSpent,
    todayTotalSpentWithBills,
    fixedBillsCountToday,
    totalFixedBillsBudget,
    totalFixedBillsSpent: cycleFixedBillsSpent,
  };
}


