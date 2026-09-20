import { financeToolDeclarations, executeFinanceTool } from './finance.tools.ts';
import { budgetToolDeclarations, executeBudgetTool } from './budget.tools.ts';
import { reportToolDeclarations, executeReportTool } from './report.tools.ts';
import { logger } from '../utils/logger.ts';

export function getAllToolDeclarations() {
  return [
    ...financeToolDeclarations,
    ...budgetToolDeclarations,
    ...reportToolDeclarations,
  ];
}

export async function dispatchToolCall(
  toolName: string,
  args: Record<string, any>,
  userId: string
) {
  logger.info('ToolRegistry', `Dispatching tool '${toolName}'`, { userId, args });

  try {
    if (financeToolDeclarations.some((t) => t.name === toolName)) {
      return await executeFinanceTool(toolName, args, userId);
    }

    if (budgetToolDeclarations.some((t) => t.name === toolName)) {
      return await executeBudgetTool(toolName, args, userId);
    }

    if (reportToolDeclarations.some((t) => t.name === toolName)) {
      return await executeReportTool(toolName, args, userId);
    }

    throw new Error(`Tool '${toolName}' is not registered in central registry.`);
  } catch (err) {
    logger.error('ToolRegistry', `Tool execution failed for '${toolName}'`, err, { userId, args });
    throw err;
  }
}
