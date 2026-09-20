import { logger } from '../utils/logger.ts';

export interface AuditLogEntry {
  userId?: string;
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
  // Stream to console/cloud structured log explorer without adding DB write latency
  logger.debug('AuditLog', `Audit event: ${params.action}`, {
    userId: params.userId,
    entity: params.resourceType,
    resourceId: params.resourceId,
    details: params.details,
  });

  /* UNCOMMENT TO PERSIST AUDIT LOGS TO SUPABASE POSTGRES DB:
  try {
    const { getSupabaseClient } = await import('./supabase.ts');
    const supabase = getSupabaseClient();
    await supabase.from('audit_logs').insert({
      user_id: params.userId,
      actor: params.userId ? 'user' : 'system',
      entity: params.resourceType || 'transaction',
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      details: params.details || {},
    });
  } catch (err) {
    logger.warn('AuditLog', 'Failed DB audit insert', { error: String(err) });
  }
  */
}
