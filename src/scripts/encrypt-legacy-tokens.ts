import { getSupabaseClient } from '../db/supabase.ts';
import { encryptText } from '../utils/crypto.ts';
import { logger } from '../utils/logger.ts';

/**
 * Script migrasi otomatis untuk mengubah semua legacy refresh_token di database
 * yang masih berbentuk plain-text menjadi terenkripsi AES-256-GCM.
 */
export async function encryptAllLegacyTokens(): Promise<{ total: number; encrypted: number }> {
  const supabase = getSupabaseClient();

  const { data: accounts, error } = await supabase
    .from('email_accounts')
    .select('id, email, refresh_token');

  if (error) {
    logger.error('Script:EncryptLegacy', 'Failed to fetch email_accounts from database', error);
    throw error;
  }

  if (!accounts || accounts.length === 0) {
    logger.info('Script:EncryptLegacy', 'No email_accounts found in database.');
    return { total: 0, encrypted: 0 };
  }

  let encryptedCount = 0;

  for (const acc of accounts) {
    if (!acc.refresh_token) continue;

    // Hanya enkripsi token yang belum memiliki awalan 'enc:'
    if (!acc.refresh_token.startsWith('enc:')) {
      const encryptedToken = encryptText(acc.refresh_token);

      const { error: updateError } = await supabase
        .from('email_accounts')
        .update({ refresh_token: encryptedToken })
        .eq('id', acc.id);

      if (updateError) {
        logger.error('Script:EncryptLegacy', `Failed to encrypt legacy token for account ${acc.email}`, updateError);
      } else {
        encryptedCount++;
        logger.info('Script:EncryptLegacy', `Successfully encrypted legacy token for ${acc.email}`);
      }
    }
  }

  return { total: accounts.length, encrypted: encryptedCount };
}

// Run directly if invoked from command line
if (import.meta.url === `file://${process.argv[1]}`) {
  encryptAllLegacyTokens().then((res) => {
    console.log(`✅ [Migration Complete] Analyzed ${res.total} accounts, newly encrypted ${res.encrypted} legacy tokens.`);
  }).catch((err) => {
    console.error('❌ Migration script failed:', err);
  });
}
