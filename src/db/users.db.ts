import { getSupabaseClient } from './supabase.ts';
import type { User } from '../types/index.ts';

export async function getOrCreateUserByTelegramId(
  telegramId: number,
  firstName?: string,
  username?: string
): Promise<User> {
  const supabase = getSupabaseClient();

  // 1. Try to find existing user
  const { data: existingUser, error: selectError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (selectError) {
    console.error('Error fetching user by telegram_id:', selectError);
    throw selectError;
  }

  if (existingUser) {
    return existingUser as User;
  }

  // 2. Create new user if not exists
  const { data: newUser, error: insertError } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      first_name: firstName || null,
      username: username || null,
    })
    .select('*')
    .single();

  if (insertError) {
    console.error('Error creating new user:', insertError);
    throw insertError;
  }

  return newUser as User;
}

export async function updateUserSalaryCutoffDay(userId: string, cutoffDay: number): Promise<void> {
  if (cutoffDay < 1 || cutoffDay > 31) {
    throw new Error('Salary cutoff day must be between 1 and 31.');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('users')
    .update({ salary_cutoff_day: cutoffDay, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('Error updating salary cutoff day:', error);
    throw error;
  }
}

export async function getUserSalaryCutoffDay(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('salary_cutoff_day')
    .eq('id', userId)
    .single();

  if (error || !data || !data.salary_cutoff_day) {
    return 1; // Default to 1st of month if unset
  }

  return Number(data.salary_cutoff_day);
}
