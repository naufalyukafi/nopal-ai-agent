import { getSupabaseClient } from './supabase.ts';
import { logger } from '../utils/logger.ts';

export interface ChatMessage {
  id?: string;
  userId: string;
  role: 'user' | 'model' | 'system';
  content: string;
  createdAt?: string;
}

export async function saveChatMessage(params: {
  userId: string;
  role: 'user' | 'model';
  content: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('chat_messages').insert({
      user_id: params.userId,
      role: params.role,
      content: params.content,
    });

    if (error) {
      logger.error('DB:Chat', 'Error saving chat message', error, { userId: params.userId, role: params.role });
    }
  } catch (err) {
    logger.error('DB:Chat', 'Exception saving chat message', err, { userId: params.userId });
  }
}

export async function getRecentChatMessages(
  userId: string,
  limit: number = 6
): Promise<{ role: 'user' | 'model'; content: string }[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      logger.error('DB:Chat', 'Error fetching recent chat messages', error, { userId });
      return [];
    }

    // Reverse so chronologically oldest is first
    return (data as any[]).reverse().map((msg) => ({
      role: msg.role as 'user' | 'model',
      content: msg.content,
    }));
  } catch (err) {
    logger.error('DB:Chat', 'Exception fetching recent chat messages', err, { userId });
    return [];
  }
}
