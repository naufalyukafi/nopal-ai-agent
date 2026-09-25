export interface User {
  id: string;
  telegram_id: number;
  first_name?: string;
  username?: string;
  salary_cutoff_day?: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  category_id?: string;
  description?: string;
  source: 'manual' | 'gmail';
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
  gmail_message_id?: string;
  raw_metadata?: Record<string, unknown>;
  transaction_date: string;
  created_at: string;
}

export interface Category {
  id: string;
  user_id?: string;
  name: string;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  period: string;
  limit_amount: number;
  created_at: string;
}

export interface ToolExecutionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface SmartDailyLimitStatus {
  recommendedDailyLimit: number;
  todaySpent: number;
  todayRemainingLimit: number;
  remainingDays: number;
  totalMonthlyBudget: number;
  remainingMonthlyBudget: number;
  percentageSpentToday: number;
  status: 'SAFE' | 'WARNING' | 'OVER_LIMIT';
  progressBar: string;
  salaryCycleEnd: string;
  todayFixedBillsSpent?: number;
  todayTotalSpentWithBills?: number;
  fixedBillsCountToday?: number;
}


