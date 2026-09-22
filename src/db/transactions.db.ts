import { getSupabaseClient } from './supabase.ts';
import type { Transaction } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { logAuditEvent } from './audit.db.ts';
import { getOrCreateCategoryByName } from './budgets.db.ts';
import { getWIBTodayRange, getWIBMonthRange, getWIBMonthPeriod } from '../utils/date.ts';

export async function createManualTransaction(params: {
  userId: string;
  amount: number;
  categoryName?: string;
  description?: string;
}): Promise<Transaction> {
  const supabase = getSupabaseClient();

  // 1. Resolve or create category_id if categoryName is provided
  let categoryId: string | null = null;
  if (params.categoryName) {
    categoryId = await getOrCreateCategoryByName(params.userId, params.categoryName);
  }

  // 2. Insert transaction directly with status 'confirmed' (since user manually entered it)
  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: params.userId,
      amount: params.amount,
      category_id: categoryId,
      description: params.description || null,
      source: 'manual',
      status: 'confirmed',
      transaction_date: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    logger.error('DB:Transactions', 'Error creating manual transaction', error, { params });
    throw error;
  }

  logger.info('DB:Transactions', `Manual transaction recorded successfully`, { txId: tx.id, amount: params.amount });
  return tx as Transaction;
}

export async function getRecentTransactions(
  userId: string,
  limit: number = 5
): Promise<Transaction[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('transactions')
    .select('*, categories(name)')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .order('transaction_date', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('DB:Transactions', 'Error fetching recent transactions', error, { userId, limit });
    throw error;
  }

  return (data || []) as Transaction[];
}

export async function getPendingTransactions(userId: string): Promise<Transaction[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('transactions')
    .select('*, categories(name)')
    .eq('user_id', userId)
    .eq('status', 'pending_confirmation')
    .order('transaction_date', { ascending: false });

  if (error) {
    logger.error('DB:Transactions', 'Error fetching pending transactions', error, { userId });
    throw error;
  }

  return (data || []) as Transaction[];
}

export async function confirmAllPendingTransactions(userId: string): Promise<number> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('transactions')
    .update({ status: 'confirmed' })
    .eq('user_id', userId)
    .eq('status', 'pending_confirmation')
    .select('id');

  if (error) {
    logger.error('DB:Transactions', 'Error batch confirming pending transactions', error, { userId });
    throw error;
  }

  const count = data ? data.length : 0;
  logger.info('DB:Transactions', `Batch confirmed ${count} pending transactions`, { userId });

  await logAuditEvent({
    userId,
    action: 'BATCH_CONFIRM_TRANSACTIONS',
    resourceType: 'transaction',
    details: { confirmedCount: count },
  });

  return count;
}

export async function confirmTransaction(id: string, userId?: string): Promise<Transaction> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('transactions')
    .update({ status: 'confirmed' })
    .eq('id', id);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.select('*').single();

  if (error) {
    logger.error('DB:Transactions', `Error confirming transaction ${id}`, error);
    throw error;
  }

  logger.info('DB:Transactions', `Transaction ${id} confirmed successfully`);

  await logAuditEvent({
    userId: userId || (data as any)?.user_id,
    action: 'CONFIRM_TRANSACTION',
    resourceType: 'transaction',
    resourceId: id,
    details: { amount: data.amount, categoryId: data.category_id },
  });

  return data as Transaction;
}

export async function rejectTransaction(id: string, userId?: string): Promise<Transaction> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('transactions')
    .update({ status: 'rejected' })
    .eq('id', id);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.select('*').single();

  if (error) {
    logger.error('DB:Transactions', `Error rejecting transaction ${id}`, error);
    throw error;
  }

  logger.info('DB:Transactions', `Transaction ${id} rejected successfully`);

  await logAuditEvent({
    userId: userId || (data as any)?.user_id,
    action: 'REJECT_TRANSACTION',
    resourceType: 'transaction',
    resourceId: id,
    details: { amount: data.amount },
  });

  return data as Transaction;
}

export async function getMonthlyCategorySummary(
  userId: string,
  periodStr?: string // e.g. '2026-09'
): Promise<{ categoryName: string; totalAmount: number }[]> {
  const supabase = getSupabaseClient();
  const targetPeriod = periodStr || getWIBMonthPeriod();
  const [year, month] = targetPeriod.split('-').map(Number);
  const { startDate, endDate } = getWIBMonthRange(year, month);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, categories(name)')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate);

  const categoryCentsMap: Record<string, number> = {};
  if (data) {
    for (const item of data as any[]) {
      const catName = item.categories?.name || 'Lain-lain';
      const amtCents = Math.round((Number(item.amount) || 0) * 100);
      categoryCentsMap[catName] = (categoryCentsMap[catName] || 0) + amtCents;
    }
  }

  return Object.entries(categoryCentsMap).map(([categoryName, totalCents]) => ({
    categoryName,
    totalAmount: Math.round(totalCents) / 100,
  }));
}

export async function updateTransactionCategory(params: {
  userId: string;
  transactionQuery?: string;
  amount?: number;
  newCategoryName: string;
}): Promise<Transaction> {
  const supabase = getSupabaseClient();

  // 1. Find or create target category
  const categoryId = await getOrCreateCategoryByName(params.userId, params.newCategoryName);

  // 2. Fetch recent transactions for this user (up to 50) to find exact match
  const { data: txs, error: fetchError } = await supabase
    .from('transactions')
    .select('*, categories(name)')
    .eq('user_id', params.userId)
    .order('transaction_date', { ascending: false })
    .limit(50);

  if (fetchError || !txs || txs.length === 0) {
    throw new Error('Tidak ditemukan transaksi yang sesuai untuk diubah kategorinya.');
  }

  const queryLower = params.transactionQuery ? params.transactionQuery.trim().toLowerCase() : '';
  const targetAmount = params.amount ? Number(params.amount) : undefined;

  let candidateTxs = txs;

  // Filter 1: If amount specified, filter by amount. If no match, throw error instead of silent corruption
  if (targetAmount && targetAmount > 0) {
    const amountMatches = candidateTxs.filter((t: any) => Number(t.amount) === targetAmount);
    if (amountMatches.length === 0) {
      throw new Error(`Tidak ditemukan transaksi dengan nominal Rp ${targetAmount.toLocaleString('id-ID')}.`);
    }
    candidateTxs = amountMatches;
  }

  // Filter 2: If query specified, check description OR current category name
  if (queryLower) {
    const queryMatches = candidateTxs.filter((t: any) => {
      const descMatch = (t.description || '').toLowerCase().includes(queryLower);
      const catMatch = (t.categories?.name || '').toLowerCase().includes(queryLower);
      return descMatch || catMatch;
    });
    if (queryMatches.length === 0) {
      throw new Error(`Tidak ditemukan transaksi yang cocok dengan kata kunci "${params.transactionQuery}".`);
    }
    candidateTxs = queryMatches;
  }

  if (candidateTxs.length === 0) {
    throw new Error('Tidak ditemukan transaksi yang cocok dengan kriteria untuk diubah kategorinya.');
  }

  const targetTx = candidateTxs[0];

  // 3. Update transaction category_id
  const { data: updatedTx, error: updateError } = await supabase
    .from('transactions')
    .update({ category_id: categoryId })
    .eq('id', targetTx.id)
    .select('*, categories(name)')
    .single();

  if (updateError) {
    logger.error('DB:Transactions', 'Error updating transaction category', updateError);
    throw updateError;
  }

  return updatedTx as Transaction;
}

export async function getTodayTransactionsSummary(
  userId: string,
  referenceDate: Date = new Date()
): Promise<{
  totalSpent: number;
  count: number;
  transactions: Array<{ id: string; amount: number; description: string; categoryName: string; time: string }>;
}> {
  const supabase = getSupabaseClient();
  const { startDate, endDate } = getWIBTodayRange(referenceDate);

  const { data: txs, error } = await supabase
    .from('transactions')
    .select('id, amount, description, transaction_date, categories(name)')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)
    .order('transaction_date', { ascending: false });

  if (error) {
    logger.error('DB:Transactions', 'Error fetching today transactions', error, { userId });
    throw error;
  }

  let totalCents = 0;
  const list = (txs || []).map((t: any) => {
    const amtCents = Math.round((Number(t.amount) || 0) * 100);
    totalCents += amtCents;
    const time = new Date(t.transaction_date).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    });
    return {
      id: t.id,
      amount: Number(t.amount),
      description: t.description || 'Pengeluaran',
      categoryName: t.categories?.name || 'Lain-lain',
      time,
    };
  });

  return {
    totalSpent: Math.round(totalCents) / 100,
    count: list.length,
    transactions: list,
  };
}
