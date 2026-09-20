import { getSupabaseClient } from './supabase.ts';
import { getUserSalaryCutoffDay } from './users.db.ts';
import type { Budget } from '../types/index.ts';
import { logger } from '../utils/logger.ts';

export function calculateSalaryCycleDateRange(
  cutoffDay: number,
  referenceDate: Date = new Date()
): { startDate: string; endDate: string } {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth(); // 0-indexed
  const day = referenceDate.getUTCDate();

  if (cutoffDay <= 1) {
    // Default calendar month 1st to last day of month
    const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }

  if (day >= cutoffDay) {
    // Current cycle: cutoffDay of current month -> (cutoffDay - 1) of next month
    const start = new Date(Date.UTC(year, month, cutoffDay, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month + 1, cutoffDay - 1, 23, 59, 59, 999));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  } else {
    // Current cycle: cutoffDay of previous month -> (cutoffDay - 1) of current month
    const start = new Date(Date.UTC(year, month - 1, cutoffDay, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, cutoffDay - 1, 23, 59, 59, 999));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
}

export async function getOrCreateCategoryByName(userId: string, categoryName: string): Promise<string> {
  const supabase = getSupabaseClient();
  const trimmed = categoryName.trim();

  // 1. Exact match check
  const { data: exactCat } = await supabase
    .from('categories')
    .select('id')
    .ilike('name', trimmed)
    .limit(1)
    .maybeSingle();

  if (exactCat) {
    return exactCat.id;
  }

  // 2. Partial match check
  const { data: partialCat } = await supabase
    .from('categories')
    .select('id')
    .ilike('name', `%${trimmed}%`)
    .limit(1)
    .maybeSingle();

  if (partialCat) {
    return partialCat.id;
  }

  // 3. Insert new category
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
  const targetPeriod = params.period || new Date().toISOString().slice(0, 7);

  // 1. Find or create category
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
): Promise<{ categoryName: string; limitAmount: number; spentAmount: number; remainingAmount: number; percentageSpent: number }[]> {
  const supabase = getSupabaseClient();
  const targetPeriod = periodStr || new Date().toISOString().slice(0, 7);

  const cutoffDay = await getUserSalaryCutoffDay(userId);
  let startDate: string;
  let endDate: string;

  if (periodStr) {
    const [year, month] = targetPeriod.split('-').map(Number);
    startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)).toISOString();
    endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
  } else {
    const range = calculateSalaryCycleDateRange(cutoffDay, new Date());
    startDate = range.startDate;
    endDate = range.endDate;
  }

  // 1. Fetch budgets for this period
  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('id, limit_amount, category_id, categories(id, name)')
    .eq('user_id', userId)
    .eq('period', targetPeriod);

  if (budgetError) {
    logger.error('DB:Budgets', 'Error fetching budgets', budgetError, { userId, targetPeriod });
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
    logger.error('DB:Budgets', 'Error fetching transactions for budget status', txError, { userId, targetPeriod });
  }

  // Group spent amounts by category_id
  const spentByCategoryId: Record<string, { name: string; amount: number }> = {};
  for (const tx of txs || []) {
    // @ts-ignore
    const catId = tx.category_id || 'uncategorized';
    // @ts-ignore
    const catName = tx.categories?.name || 'Lain-lain';

    if (!spentByCategoryId[catId]) {
      spentByCategoryId[catId] = { name: catName, amount: 0 };
    }
    spentByCategoryId[catId].amount += Number(tx.amount || 0);
  }

  const categoryMap = new Map<string, { categoryName: string; limitAmount: number; spentAmount: number }>();

  // Add configured budgets
  for (const b of activeBudgets) {
    // @ts-ignore
    const catId = b.category_id;
    // @ts-ignore
    const catName = b.categories?.name || 'Kategori';
    const limit = Number(b.limit_amount || 0);
    const spent = spentByCategoryId[catId]?.amount || 0;

    categoryMap.set(catId, {
      categoryName: catName,
      limitAmount: limit,
      spentAmount: spent,
    });
  }

  // Add categories that have spending even if no budget limit was set
  for (const [catId, data] of Object.entries(spentByCategoryId)) {
    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, {
        categoryName: data.name,
        limitAmount: 0,
        spentAmount: data.amount,
      });
    }
  }

  const results = [];
  for (const [_, item] of categoryMap) {
    const limitAmount = item.limitAmount;
    const spentAmount = item.spentAmount;
    const remainingAmount = limitAmount > 0 ? limitAmount - spentAmount : 0;
    const percentageSpent = limitAmount > 0 ? Math.round((spentAmount / limitAmount) * 100) : 0;

    results.push({
      categoryName: item.categoryName,
      limitAmount,
      spentAmount,
      remainingAmount,
      percentageSpent,
    });
  }

  return results;
}
