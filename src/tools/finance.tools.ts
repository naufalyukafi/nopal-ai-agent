import { createManualTransaction, getRecentTransactions, getPendingTransactions, confirmAllPendingTransactions } from '../db/transactions.db.ts';
import { env } from '../config/env.ts';

export const financeToolDeclarations = [
  {
    name: 'record_manual_transaction',
    description: 'Record a new manual transaction (expense or income) submitted directly by the user via chat.',
    parameters: {
      type: 'OBJECT',
      properties: {
        amount: {
          type: 'NUMBER',
          description: 'Total transaction amount in IDR (e.g. 50000 for Rp 50.000). Do not include dots or commas.',
        },
        categoryName: {
          type: 'STRING',
          description: 'Category name of the transaction, e.g. "Makanan & Minuman", "Transportasi", "Belanja", "Tagihan", "Hiburan".',
        },
        description: {
          type: 'STRING',
          description: 'Short description of the transaction, e.g. "kopi kenangan", "bensin pertalite", "nasi goreng warteg".',
        },
      },
      required: ['amount', 'categoryName'],
    },
  },
  {
    name: 'list_recent_transactions',
    description: 'List recent recorded and confirmed transactions for the user.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: {
          type: 'NUMBER',
          description: 'Number of recent transactions to retrieve (default: 5).',
        },
      },
    },
  },
  {
    name: 'list_pending_transactions',
    description: 'List transactions detected from emails that are waiting for user confirmation.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'confirm_all_pending',
    description: 'Approve and confirm all pending email transactions in batch at once.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_gmail_auth_link',
    description: 'Generate the Gmail OAuth 2.0 authorization link so the user can connect their Gmail account.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'update_transaction_category',
    description: 'Change or edit the category of a recorded transaction (e.g. change transaction "Bravo" category to "Utilitas & Rumah Tangga").',
    parameters: {
      type: 'OBJECT',
      properties: {
        transactionQuery: {
          type: 'STRING',
          description: 'Search term for transaction description or merchant name (e.g. "bravo", "lipstik", "shopeepay").',
        },
        amount: {
          type: 'NUMBER',
          description: 'Optional transaction amount in IDR to narrow down the target transaction.',
        },
        newCategoryName: {
          type: 'STRING',
          description: 'New category name to set (e.g. "Utilitas & Rumah Tangga", "Makanan & Minuman", "Skincare & Perawatan").',
        },
      },
      required: ['newCategoryName'],
    },
  },
  {
    name: 'get_today_spending',
    description: 'Get total expenses/spending recorded for today (current date) along with today transaction list.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
];

export async function executeFinanceTool(toolName: string, args: Record<string, any>, userId: string) {
  if (toolName === 'record_manual_transaction') {
    const tx = await createManualTransaction({
      userId,
      amount: Number(args.amount),
      categoryName: args.categoryName,
      description: args.description,
    });
    return {
      success: true,
      message: `Transaksi sebesar Rp ${tx.amount.toLocaleString('id-ID')} (${args.categoryName}) berhasil dicatat.`,
      data: tx,
    };
  }

  if (toolName === 'list_recent_transactions') {
    const txs = await getRecentTransactions(userId, args.limit || 5);
    return {
      success: true,
      message: `Berhasil mengambil ${txs.length} transaksi terakhir.`,
      data: txs,
    };
  }

  if (toolName === 'list_pending_transactions') {
    const pendingTxs = await getPendingTransactions(userId);
    return {
      success: true,
      message: `Terdapat ${pendingTxs.length} transaksi pending dari email yang menunggu konfirmasi Anda.`,
      data: pendingTxs,
    };
  }

  if (toolName === 'confirm_all_pending') {
    const count = await confirmAllPendingTransactions(userId);
    return {
      success: true,
      message: `Berhasil mengonfirmasi ${count} transaksi pending secara masal.`,
      data: { confirmedCount: count },
    };
  }

  if (toolName === 'get_gmail_auth_link') {
    const supabaseUrl = env.SUPABASE_URL || 'https://pobbqgnckilmqmrpiaod.supabase.co';
    const authUrl = `${supabaseUrl}/functions/v1/gmail-sync/auth?userId=${userId}`;
    return {
      success: true,
      message: `Silakan klik tautan berikut untuk menghubungkan akun Gmail Anda:\n${authUrl}`,
      authUrl,
    };
  }

  if (toolName === 'update_transaction_category') {
    const { updateTransactionCategory } = await import('../db/transactions.db.ts');
    const updatedTx = await updateTransactionCategory({
      userId,
      transactionQuery: args.transactionQuery,
      amount: args.amount ? Number(args.amount) : undefined,
      newCategoryName: args.newCategoryName,
    });
    // @ts-ignore
    const catName = updatedTx.categories?.name || args.newCategoryName;
    return {
      success: true,
      message: `Kategori transaksi "${updatedTx.description || 'Transaksi'}" (Rp ${Number(updatedTx.amount).toLocaleString('id-ID')}) berhasil diubah menjadi "${catName}".`,
      data: updatedTx,
    };
  }

  if (toolName === 'get_today_spending') {
    const { getTodayTransactionsSummary } = await import('../db/transactions.db.ts');
    const todaySummary = await getTodayTransactionsSummary(userId);
    return {
      success: true,
      message: `Total pengeluaran hari ini: Rp ${todaySummary.totalSpent.toLocaleString('id-ID')} (${todaySummary.count} transaksi).`,
      data: todaySummary,
    };
  }

  throw new Error(`Unknown finance tool: ${toolName}`);
}
