import { logger } from '../utils/logger.ts';

export interface AuditLogEntry {
  userId?: string;
  actor?: 'user' | 'agent' | 'system';
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
}

/**
 * ARCHITECTURAL NOTE:
 * Structured logging and tracing are streamed directly to Supabase Edge Function Logs Explorer
 * via `logger.ts` for maximum performance, minimal HTTP latency (<1.5s), and clean Postgres DB storage.
 *
 * Database persistence to `audit_logs`, `agent_runs`, and `tool_calls` tables is commented out below.
 * To enable full DB audit persistence in the future, uncomment the Supabase `.from('audit_logs').insert(...)` call.
 */
export async function logAuditEvent(params: AuditLogEntry): Promise<void> {
  logger.info('AuditLog', `Audit event: ${params.action}`, {
    userId: params.userId,
    entity: params.resourceType,
    resourceId: params.resourceId,
    details: params.details,
  });

  try {
    const { getSupabaseClient } = await import('./supabase.ts');
    const supabase = getSupabaseClient();
    await supabase.from('audit_logs').insert({
      user_id: params.userId || null,
      actor: params.actor || (params.userId ? 'user' : 'system'),
      entity: params.resourceType || 'system',
      action: params.action,
      payload: {
        resource_id: params.resourceId,
        ...(params.details || {}),
      },
    });
  } catch (err) {
    logger.warn('AuditLog', 'Failed DB audit insert', { error: String(err) });
  }
}
