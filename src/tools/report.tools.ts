import { getMonthlyCategorySummary } from '../db/transactions.db.ts';

export const reportToolDeclarations = [
  {
    name: 'generate_financial_summary',
    description: 'Get total monthly spending summary and breakdown by expense category.',
    parameters: {
      type: 'OBJECT',
      properties: {
        period: {
          type: 'STRING',
          description: 'Report period format YYYY-MM (e.g. "2026-09"). Defaults to current month if omitted.',
        },
      },
    },
  },
];

export async function executeReportTool(toolName: string, args: Record<string, any>, userId: string) {
  if (toolName === 'generate_financial_summary') {
    const summary = await getMonthlyCategorySummary(userId, args.period);
    const totalSpent = summary.reduce((sum, item) => sum + item.totalAmount, 0);

    return {
      success: true,
      message: `Laporan keuangan berhasil dibuat. Total pengeluaran: Rp ${totalSpent.toLocaleString('id-ID')}.`,
      data: {
        totalSpent,
        breakdown: summary,
      },
    };
  }

  throw new Error(`Unknown report tool: ${toolName}`);
}
