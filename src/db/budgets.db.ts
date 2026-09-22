import { getSupabaseClient } from './supabase.ts';
import { getUserSalaryCutoffDay } from './users.db.ts';
import type { Budget } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { getWIBDate, getDaysInMonth, getWIBMonthPeriod, getWIBMonthRange } from '../utils/date.ts';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface BudgetCategoryStatus {
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  spentAmount: number;
  remainingAmount: number;
  percentageSpent: number;
}

export function calculateSalaryCycleDateRange(
  cutoffDay: number,
  referenceDate: Date = new Date()
): { startDate: string; endDate: string; cycleMonthPeriod: string } {
  const wib = getWIBDate(referenceDate);
  const year = wib.year;
  const month = wib.month; // 1-12
  const day = wib.day;

  if (cutoffDay <= 1) {
    // Default calendar month 1st to last day of month in WIB
    const monthRange = getWIBMonthRange(year, month);
    const cycleMonthPeriod = `${year}-${String(month).padStart(2, '0')}`;
    return {
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      cycleMonthPeriod,
    };
  }

  if (day >= cutoffDay) {
    // Current cycle: cutoffDay of current month -> (cutoffDay - 1) of next month
    const daysInCurrMonth = getDaysInMonth(year, month);
    const actualStartDay = Math.min(cutoffDay, daysInCurrMonth);

    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const daysInNextMonth = getDaysInMonth(nextYear, nextMonth);
    const actualEndDay = Math.min(cutoffDay - 1, daysInNextMonth);

    const startUtc = Date.UTC(year, month - 1, actualStartDay, 0, 0, 0, 0) - WIB_OFFSET_MS;
    const endUtc = Date.UTC(nextYear, nextMonth - 1, actualEndDay, 23, 59, 59, 999) - WIB_OFFSET_MS;
    const cycleMonthPeriod = `${year}-${String(month).padStart(2, '0')}`;

    return {
      startDate: new Date(startUtc).toISOString(),
      endDate: new Date(endUtc).toISOString(),
      cycleMonthPeriod,
    };
  } else {
    // Current cycle: cutoffDay of previous month -> (cutoffDay - 1) of current month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
    const actualStartDay = Math.min(cutoffDay, daysInPrevMonth);

    const daysInCurrMonth = getDaysInMonth(year, month);
    const actualEndDay = Math.min(cutoffDay - 1, daysInCurrMonth);

    const startUtc = Date.UTC(prevYear, prevMonth - 1, actualStartDay, 0, 0, 0, 0) - WIB_OFFSET_MS;
    const endUtc = Date.UTC(year, month - 1, actualEndDay, 23, 59, 59, 999) - WIB_OFFSET_MS;
    const cycleMonthPeriod = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    return {
      startDate: new Date(startUtc).toISOString(),
      endDate: new Date(endUtc).toISOString(),
      cycleMonthPeriod,
    };
  }
}

export async function getOrCreateCategoryByName(userId: string, categoryName: string): Promise<string> {
  const supabase = getSupabaseClient();
  const trimmed = categoryName.trim();

  // 1. Exact match check (scoped by user_id OR default system category where user_id IS NULL)
  const { data: exactCat } = await supabase
    .from('categories')
    .select('id, user_id')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .ilike('name', trimmed)
    .order('user_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (exactCat) {
    return exactCat.id;
  }

  // 2. Partial match check (scoped by user_id OR default system category where user_id IS NULL)
  const { data: partialCat } = await supabase
    .from('categories')
    .select('id, user_id')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .ilike('name', `%${trimmed}%`)
    .order('user_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (partialCat) {
    return partialCat.id;
  }

  // 3. Insert new category for this user
  const { data: newCat, error: catError } = await supabase
    .from('categories')
    .insert({
      user_id: userId,
      name: trimmed,
    })
    .select('id')
    .single();

  if (catError) {
    logger.error('DB:Categories', 'Error creating category', catError, { categoryName });
    throw catError;
  }

  return newCat.id;
}

export async function setCategoryBudget(params: {
  userId: string;
  categoryName: string;
  limitAmount: number;
  period?: string;
}): Promise<Budget> {
  const supabase = getSupabaseClient();
  const targetPeriod = params.period || getWIBMonthPeriod();

  // 1. Find or create category scoped to this user
  const categoryId = await getOrCreateCategoryByName(params.userId, params.categoryName);

  // 2. Upsert budget
  const { data: budget, error } = await supabase
    .from('budgets')
    .upsert(
      {
        user_id: params.userId,
        category_id: categoryId,
        period: targetPeriod,
        limit_amount: params.limitAmount,
      },
      { onConflict: 'user_id,category_id,period' }
    )
    .select('*')
    .single();

  if (error) {
    logger.error('DB:Budgets', 'Error upserting budget', error, { params });
    throw error;
  }

  logger.info('DB:Budgets', `Budget set successfully`, { userId: params.userId, categoryName: params.categoryName, limitAmount: params.limitAmount });
  return budget as Budget;
}

export async function getBudgetStatus(
  userId: string,
  periodStr?: string
): Promise<BudgetCategoryStatus[]> {
  const supabase = getSupabaseClient();

  const cutoffDay = await getUserSalaryCutoffDay(userId);
  let startDate: string;
  let endDate: string;
  let canonicalPeriod: string;

  if (periodStr) {
    canonicalPeriod = periodStr;
    const [year, month] = periodStr.split('-').map(Number);
    const range = getWIBMonthRange(year, month);
    startDate = range.startDate;
    endDate = range.endDate;
  } else {
    const range = calculateSalaryCycleDateRange(cutoffDay, new Date());
    startDate = range.startDate;
    endDate = range.endDate;
    canonicalPeriod = range.cycleMonthPeriod;
  }

  // 1. Fetch budgets for this period
  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('id, limit_amount, category_id, categories(id, name)')
    .eq('user_id', userId)
    .eq('period', canonicalPeriod);

  if (budgetError) {
    logger.error('DB:Budgets', 'Error fetching budgets', budgetError, { userId, canonicalPeriod });
    throw budgetError;
  }

  let activeBudgets = budgets || [];
  // Fallback to latest configured budget per category if no explicit budget entry exists for this period
  if (activeBudgets.length === 0) {
    const { data: latestBudgets } = await supabase
      .from('budgets')
      .select('id, limit_amount, category_id, categories(id, name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const seenCategoryIds = new Set<string>();
    activeBudgets = (latestBudgets || []).filter((b: any) => {
      if (seenCategoryIds.has(b.category_id)) return false;
      seenCategoryIds.add(b.category_id);
      return true;
    });
  }

  // 2. Fetch all confirmed transactions in this period
  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('amount, category_id, categories(id, name)')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate);

  if (txError) {
    logger.error('DB:Budgets', 'Error fetching transactions for budget status', txError, { userId, canonicalPeriod });
  }

  // Group spent amounts by category_id using cent integer arithmetic
  const spentByCategoryId: Record<string, { name: string; amountCents: number }> = {};
  for (const tx of txs || []) {
    const catId = (tx.category_id as string) || 'uncategorized';
    // @ts-ignore
    const catName = tx.categories?.name || 'Lain-lain';

    if (!spentByCategoryId[catId]) {
      spentByCategoryId[catId] = { name: catName, amountCents: 0 };
    }
    const amtCents = Math.round((Number(tx.amount) || 0) * 100);
    spentByCategoryId[catId].amountCents += amtCents;
  }

  const categoryMap = new Map<string, { categoryId: string; categoryName: string; limitAmount: number; spentAmount: number }>();
  const nameToCatIdKey = new Map<string, string>();

  // Add configured budgets
  for (const b of activeBudgets) {
    const catId = b.category_id as string;
    // @ts-ignore
    const catName = b.categories?.name || 'Kategori';
    const limit = Number(b.limit_amount || 0);
    const spentCents = spentByCategoryId[catId]?.amountCents || 0;
    const spent = Math.round(spentCents) / 100;

    categoryMap.set(catId, {
      categoryId: catId,
      categoryName: catName,
      limitAmount: limit,
      spentAmount: spent,
    });
    nameToCatIdKey.set(catName.trim().toLowerCase(), catId);
  }

  // Add categories that have spending even if no budget limit was set,
  // or merge if a category with the same normalized name already exists
  for (const [catId, data] of Object.entries(spentByCategoryId)) {
    const normName = data.name.trim().toLowerCase();
    const existingKey = nameToCatIdKey.get(normName);
    const spent = Math.round(data.amountCents) / 100;

    if (existingKey && existingKey !== catId) {
      // Merge spending into existing budgeted category with the same name
      const existing = categoryMap.get(existingKey)!;
      existing.spentAmount = Math.round((existing.spentAmount + spent) * 100) / 100;
    } else if (!categoryMap.has(catId)) {
      categoryMap.set(catId, {
        categoryId: catId,
        categoryName: data.name,
        limitAmount: 0,
        spentAmount: spent,
      });
      nameToCatIdKey.set(normName, catId);
    }
  }

  const results: BudgetCategoryStatus[] = [];
  for (const [_, item] of categoryMap) {
    const limitAmount = item.limitAmount;
    const spentAmount = item.spentAmount;
    const remainingAmount = limitAmount > 0 ? Math.max(0, limitAmount - spentAmount) : 0;
    const percentageSpent = limitAmount > 0 ? Math.round((spentAmount / limitAmount) * 100) : 0;

    results.push({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      limitAmount,
      spentAmount,
      remainingAmount,
      percentageSpent,
    });
  }

  return results;
}
