import { env } from '../config/env.ts';
import { getSupabaseClient } from '../db/supabase.ts';
import { encryptText, decryptText } from '../utils/crypto.ts';

export function getGoogleOAuthUrl(userId: string): string {
  const clientId = env.GMAIL_CLIENT_ID;
  const redirectUri = env.GMAIL_REDIRECT_URI;
  const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email');

  if (!clientId) {
    throw new Error('GMAIL_CLIENT_ID is not configured in environment variables.');
  }

  // Pass userId in state parameter for security & user mapping on callback
  const state = encodeURIComponent(JSON.stringify({ userId }));
  return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
}

export async function exchangeOAuthCodeForToken(code: string, userId: string) {
  const clientId = env.GMAIL_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET;
  const redirectUri = env.GMAIL_REDIRECT_URI;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.refresh_token) {
    console.error('Failed to exchange OAuth code for tokens:', tokenData);
    throw new Error(tokenData.error_description || tokenData.error || 'Failed to obtain refresh token');
  }

  // Fetch email address using Gmail Profile API first (guaranteed with gmail.readonly scope)
  let userEmail: string | undefined;

  try {
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      userEmail = profileData.emailAddress;
    }
  } catch (err) {
    console.warn('Failed to fetch Gmail profile:', err);
  }

  // Fallback to Google userinfo API
  if (!userEmail) {
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        userEmail = userInfo.email;
      }
    } catch (err) {
      console.warn('Failed to fetch userinfo:', err);
    }
  }

  if (!userEmail) {
    throw new Error('Gagal mengambil alamat email dari akun Google Anda.');
  }

  const supabase = getSupabaseClient();

  // Encrypt refresh token before storing in database
  const encryptedRefreshToken = encryptText(tokenData.refresh_token);

  // Upsert email account entry in DB
  const { data: emailAcc, error } = await supabase
    .from('email_accounts')
    .upsert(
      {
        user_id: userId,
        email: userEmail,
        refresh_token: encryptedRefreshToken,
        is_active: true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,email' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('Error saving email account:', error);
    throw error;
  }

  return { emailAccount: emailAcc, refreshToken: tokenData.refresh_token };
}

export async function getAccessTokenFromRefreshToken(refreshToken: string): Promise<string> {
  const clientId = env.GMAIL_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET;
  const decryptedToken = decryptText(refreshToken);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptedToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to refresh Gmail access token: ${data.error_description || data.error}`);
  }

  return data.access_token;
}

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function extractBodyFromPayload(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const sub = extractBodyFromPayload(part);
        if (sub) return sub;
      }
    }
  }
  return '';
}

export async function syncGmailMessagesForUser(
  userId: string,
  telegramChatId?: number
): Promise<{
  processed: number;
  newReceipts: number;
  accountEmails: string[];
  noAccounts?: boolean;
  errors?: string[];
}> {
  const { parseEmailContentWithGemini, createPendingEmailTransaction, isLikelyFinancialEmail } = await import('./gmail-parser.ts');
  const { sendTelegramConfirmationNotification } = await import('./telegram-callback.ts');
  const supabase = getSupabaseClient();

  const { data: accounts, error } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error || !accounts || accounts.length === 0) {
    return { processed: 0, newReceipts: 0, accountEmails: [], noAccounts: true };
  }

  // Fetch active user budget categories for smart category matching
  const { data: userBudgets } = await supabase
    .from('budgets')
    .select('categories(name)')
    .eq('user_id', userId);

  const activeCategories = (userBudgets || [])
    .map((b: any) => b.categories?.name)
    .filter(Boolean);

  let totalProcessed = 0;
  let totalReceipts = 0;
  const accountEmails = accounts.map((a) => a.email);
  const errors: string[] = [];

  for (const account of accounts) {
    if (!account.refresh_token) continue;

    try {
      const accessToken = await getAccessTokenFromRefreshToken(account.refresh_token);

      // Delta sync cursor: filter financial receipts directly in Gmail search to keep the batch focused
      const financialKeywords = '(pembayaran OR membayar OR bayar OR dibayar OR transaksi OR transfer OR debet OR debit OR qris OR struk OR receipt OR invoice OR order OR tagihan OR pembelian OR lunas OR terbayar OR bukti OR kuitansi OR payment OR paid OR purchase)';
      let queryParam = `newer_than:7d ${financialKeywords}`;
      if (account.last_synced_message_timestamp) {
        const lastSyncTime = new Date(account.last_synced_message_timestamp).getTime();
        // Add 5-minute safety buffer for clock skew
        const afterUnix = Math.max(0, Math.floor((lastSyncTime - 5 * 60 * 1000) / 1000));
        queryParam = `after:${afterUnix} ${financialKeywords}`;
      }

      // Search messages using timestamp cursor (limit to 25 to cover busy inbox batches)
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(queryParam)}&maxResults=25`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listRes.ok) {
        const errText = await listRes.text();
        errors.push(`${account.email}: Gagal mengambil daftar email (Status ${listRes.status})`);
        continue;
      }

      const listData = await listRes.json();
      const messages: Array<{ id: string }> = listData.messages || [];

      for (const msgRef of messages) {
        // Check if message already ingested in transactions table
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('gmail_message_id', msgRef.id)
          .maybeSingle();

        if (existingTx) continue;

        // Fetch full message content
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgRes.ok) continue;

        const msgData = await msgRes.json();
        const headers: Array<{ name: string; value: string }> = msgData.payload?.headers || [];

        const subjectHeader = headers.find((h) => h.name.toLowerCase() === 'subject');
        const subject = subjectHeader ? subjectHeader.value : '';
        const snippet = msgData.snippet || '';
        const bodyText = extractBodyFromPayload(msgData.payload) || snippet;

        totalProcessed++;

        // Fast local pre-filter: skip obvious non-financial emails without burning Gemini RPM quota
        if (!isLikelyFinancialEmail(subject, snippet, bodyText)) {
          continue;
        }

        // Rate limit safety throttle: pause 1.5s between Gemini parsing calls to guarantee < 15 RPM
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Parse email using Gemini Structured JSON Output with user active categories
        const parsed = await parseEmailContentWithGemini(subject, snippet, bodyText, activeCategories);

        // Extract accurate transaction date from Gmail message internalDate (epoch ms) or Date header
        let emailTxDate: string | undefined = undefined;
        if (msgData.internalDate) {
          const epochMs = Number(msgData.internalDate);
          if (!isNaN(epochMs) && epochMs > 0) {
            emailTxDate = new Date(epochMs).toISOString();
          }
        }
        if (!emailTxDate) {
          const dateHeader = headers.find((h) => h.name.toLowerCase() === 'date');
          if (dateHeader?.value) {
            const parsedHeaderDate = new Date(dateHeader.value);
            if (!isNaN(parsedHeaderDate.getTime())) {
              emailTxDate = parsedHeaderDate.toISOString();
            }
          }
        }

        if (parsed.isReceipt && parsed.amount > 0) {
          const createdTx = await createPendingEmailTransaction({
            userId,
            amount: parsed.amount,
            categoryName: parsed.categoryName || 'Belanja',
            description: parsed.description || subject,
            gmailMessageId: msgRef.id,
            rawMetadata: { subject, snippet, merchant: parsed.merchantName },
            transactionDate: emailTxDate,
          });

          if (createdTx) {
            totalReceipts++;
            if (telegramChatId) {
              await sendTelegramConfirmationNotification(telegramChatId, {
                id: createdTx.id,
                amount: createdTx.amount,
                description: createdTx.description,
                categoryName: parsed.categoryName,
                userId: userId,
              });
            }
          }
        }
      }

      // Update last_synced_at and last_synced_message_timestamp cursor
      const nowIso = new Date().toISOString();
      await supabase
        .from('email_accounts')
        .update({
          last_synced_at: nowIso,
          last_synced_message_timestamp: nowIso,
        })
        .eq('id', account.id);
    } catch (err) {
      console.error(`Error syncing Gmail for account ${account.email}:`, err);
      errors.push(`${account.email}: ${String((err as any)?.message || err)}`);
    }
  }

  return { processed: totalProcessed, newReceipts: totalReceipts, accountEmails, errors };
}

