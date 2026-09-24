import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env.ts';
import { getSupabaseClient } from '../db/supabase.ts';
import { logger } from '../utils/logger.ts';
import { getOrCreateCategoryByName } from '../db/budgets.db.ts';
import { sanitizeDescription } from '../utils/sanitize.ts';

export interface ExtractedEmailReceipt {
  isReceipt: boolean;
  amount: number;
  merchantName?: string;
  categoryName?: string;
  description?: string;
}

function getApiKeys(): string[] {
  const raw = env.GEMINI_API_KEY || '';
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

export function stripHtmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fast, 0-token local heuristic filter to weed out newsletters, OTPs, promotions,
 * and non-financial emails before spending API quota on Gemini.
 */
export function isLikelyFinancialEmail(subject: string, snippet: string, bodyText: string): boolean {
  const cleanSubject = (subject || '').toLowerCase();
  const cleanSnippet = (snippet || '').toLowerCase();
  const combined = `${cleanSubject} ${cleanSnippet} ${(bodyText || '').slice(0, 1500).toLowerCase()}`;

  // 1. Skip obvious non-financial noise & promo marketing newsletters WITHOUT explicit receipt signals
  const isObviousNoise = /unsubscribe|newsletter|berlangganan|lowongan|job alert|security alert|login baru|kode otp|verifikasi akun|reset password|verification code|promo|cashback|diskon|voucher|penawaran|syarat & ketentuan|klaim/i.test(cleanSubject);
  const hasStrongReceiptSignal = /berhasil|sukses|dibayar|pembayaran sebesar|total bayar|rincian transaksi|rincian pembayaran|kuitansi|struk|order #|pesanan #|bukti transfer|bukti pembayaran/i.test(combined);

  if (isObviousNoise && !hasStrongReceiptSignal) {
    return false;
  }

  // 2. Must contain an actual currency amount (e.g. Rp 10.000 or IDR 50,000 or $15) or payment terms
  const hasCurrencyPattern = /rp\s*[\d.,]{2,}|idr\s*[\d.,]{2,}|\$\s*[\d.]+|€\s*[\d.]+/i.test(combined);
  const hasFinancialSignal = /pembayaran|membayar|bayar|dibayar|transaksi|receipt|invoice|struk|order|pesanan|qris|transfer|billing|payment|purchase|paid|kuitansi|pembelian/i.test(combined);

  if (hasCurrencyPattern && (hasFinancialSignal || hasStrongReceiptSignal)) {
    return true;
  }

  // 3. Fallback: Check for known financial entities with currency numbers
  const financialEntities = /bca|mandiri|bni|bri|cimb|danamon|permata|jago|jenius|blu|seabank|ocbc|dbs|gopay|ovo|dana|shopeepay|shopee|tokopedia|grab|gojek|alfagift|indomaret|alfamart|superindo|paypal|stripe|apple|google play|steam/i;
  return financialEntities.test(combined) && hasCurrencyPattern;
}

export async function parseEmailContentWithGemini(
  subject: string,
  snippet: string,
  body: string,
  userActiveCategories?: string[]
): Promise<ExtractedEmailReceipt> {
  const keys = getApiKeys();
  const modelName = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  if (keys.length === 0) {
    logger.warn('GmailParser', 'GEMINI_API_KEY is not set. Skipping email parsing.');
    return { isReceipt: false, amount: 0 };
  }

  const cleanBody = stripHtmlToPlainText(body);

  const catPromptList = userActiveCategories && userActiveCategories.length > 0
    ? `User configured active budget categories:\n${userActiveCategories.map((c) => `- "${c}"`).join('\n')}\nStandard fallback categories: "Makanan & Minuman", "Transportasi", "Belanja", "Tagihan & Utilitas", "Hiburan & Rekreasi", "Kesehatan", "Pendidikan", "Lain-lain". ALWAYS prioritize matching the expense to a user configured active budget category if it logically fits.`
    : `Exact allowed categories: "Makanan & Minuman", "Transportasi", "Belanja", "Tagihan & Utilitas", "Hiburan & Rekreasi", "Kesehatan", "Pendidikan", or "Lain-lain".`;

  const prompt = `
Analyze the email text below and extract transaction receipt details:

Email Subject: "${subject}"
Email Snippet: "${snippet}"
Email Content:
"""
${cleanBody.slice(0, 3000)}
"""

EXTRACTION RULES:
1. "isReceipt": Set to true ONLY if this email confirms an OUTGOING EXPENSE / PAYMENT / PURCHASE / OUTGOING TRANSFER (uang keluar/pengeluaran/pembayaran/pembelian). Set to false if this is an INCOMING TRANSACTION, INCOME, MUTUAL FUND REDEMPTION (pencairan reksa dana/investasi/uang masuk), deposit, refund, promo, or non-expense notification.
2. "amount": Parse the actual numeric transaction amount (e.g., 20.00 for $20 USD, 15000 for Rp 15.000). DO NOT use subject emoji numbers (like "1💸" or "1").
3. "currency": Extracted currency ISO code: "IDR", "USD", or "EUR". Defaults to "IDR".
4. "merchantName": Extract the clean payee / merchant / recipient name (e.g. "Alfagift", "HC BRAVO BOJONEGORO", "OpenAI / ChatGPT", "GitHub"). DO NOT include raw transaction IDs, serial numbers, or long series of zeroes.
5. "categoryName": Categorize into an appropriate category. ${catPromptList} Note: Merchants like "Alfagift", "Indomaret", "Alfamart", "Superindo", "Hypermart" MUST be categorized as "Belanja" or "Makanan & Minuman" (NOT "Lain-lain").
6. "description": A short clean summary (e.g., "Alfagift", "Belanja Alfagift"). NEVER include reference numbers, long series of zeroes, or raw system tokens.
`;

  let lastError: any;

  // Key rotation and fallback loop across configured API keys
  for (const apiKey of keys) {
    try {
      logger.info('GmailParser', `Parsing email using Gemini (${modelName})`, { subject });
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isReceipt: { type: Type.BOOLEAN, description: 'True if email is a successful expense receipt' },
              amount: { type: Type.NUMBER, description: 'Parsed amount' },
              currency: { type: Type.STRING, description: 'Currency code: IDR, USD, EUR' },
              merchantName: { type: Type.STRING, description: 'Payee or merchant name' },
              categoryName: { type: Type.STRING, description: 'Category name' },
              description: { type: Type.STRING, description: 'Transaction description' },
            },
            required: ['isReceipt', 'amount'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const rawAmount = Number(parsed.amount) || 0;
      const rawCurrency = (parsed.currency || 'IDR').toUpperCase();

      let idrAmount = Math.round(rawAmount);
      let desc = parsed.description || parsed.merchantName || subject;

      // Convert foreign currencies to IDR
      if (rawCurrency === 'USD') {
        idrAmount = Math.round(rawAmount * 16000); // 1 USD = Rp 16.000
        desc = `${desc} ($${rawAmount} USD)`;
      } else if (rawCurrency === 'EUR') {
        idrAmount = Math.round(rawAmount * 17500); // 1 EUR = Rp 17.500
        desc = `${desc} (€${rawAmount} EUR)`;
      }

      let cleanMerchant = sanitizeDescription(parsed.merchantName || 'Merchant');
      let cleanDesc = sanitizeDescription(desc);

      // Smart category post-processing fallback if Gemini returned 'Lain-lain' or blank
      let categoryName = parsed.categoryName || 'Lain-lain';
      if (categoryName === 'Lain-lain' || !categoryName) {
        const combinedText = `${subject} ${cleanDesc} ${cleanMerchant}`.toLowerCase();
        if (/alfagift|alfamart|indomaret|superindo|hypermart|transmart|sayurbox|shopeefood|gofood|grabfood|kopi|bakmi|resto|cafe|food/i.test(combinedText)) {
          categoryName = /alfagift|alfamart|indomaret|superindo|hypermart|transmart|sayurbox/i.test(combinedText) ? 'Belanja' : 'Makanan & Minuman';
        } else if (/gojek|grab|maxim|indrive|m-ticket|kai|kereta|bluebird|garuda|lion|tiket/i.test(combinedText)) {
          categoryName = 'Transportasi';
        } else if (/pln|pdam|indihome|biznet|telkomsel|xl|isat|tri|tokopedia billing|lazada bill/i.test(combinedText)) {
          categoryName = 'Tagihan & Utilitas';
        }
      }

      const result: ExtractedEmailReceipt = {
        isReceipt: Boolean(parsed.isReceipt),
        amount: idrAmount,
        merchantName: cleanMerchant,
        categoryName: categoryName,
        description: cleanDesc,
      };

      logger.info('GmailParser', `Email parsed successfully via Gemini Structured Output`, {
        isReceipt: result.isReceipt,
        amount: result.amount,
        rawCurrency,
        merchant: result.merchantName,
        category: result.categoryName,
      });

      const keyHint = apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : 'key_***';

      const { logAuditEvent } = await import('../db/audit.db.ts');
      logAuditEvent({
        actor: 'system',
        action: 'GMAIL_PARSER_INVOCATION',
        resourceType: 'gmail_parser',
        details: {
          model_used: modelName,
          key_hint: keyHint,
          is_receipt: result.isReceipt,
          amount: result.amount,
          merchant: result.merchantName,
          category: result.categoryName,
        },
      }).catch(() => {});

      return result;
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || err);
      if (errMsg.includes('429') || errMsg.includes('Quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        logger.warn('GmailParser', `Quota/Rate limit hit during email parsing. Trying next API key if available...`, { error: errMsg });
        continue;
      }
      logger.error('GmailParser', 'Error parsing email content with Gemini Structured Output', err, { subject });
      return { isReceipt: false, amount: 0 };
    }
  }

  logger.error('GmailParser', 'All API keys exhausted or rate limited during email parsing', lastError, { subject });
  return { isReceipt: false, amount: 0 };
}

export async function createPendingEmailTransaction(params: {
  userId: string;
  amount: number;
  categoryName: string;
  description: string;
  gmailMessageId: string;
  rawMetadata: Record<string, any>;
  transactionDate?: string;
}) {
  const supabase = getSupabaseClient();

  // Find or create category ID
  const categoryId = await getOrCreateCategoryByName(params.userId, params.categoryName);
  const txDate = params.transactionDate || new Date().toISOString();
  const cleanDescription = sanitizeDescription(params.description);

  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: params.userId,
      amount: params.amount,
      category_id: categoryId,
      description: cleanDescription,
      source: 'gmail',
      status: 'pending_confirmation', // Human in the loop requirement
      gmail_message_id: params.gmailMessageId,
      raw_metadata: params.rawMetadata,
      transaction_date: txDate,
    })
    .select('*')
    .single();

  if (error) {
    // Unique constraint violation on gmail_message_id means already ingested
    if (error.code === '23505') {
      logger.info('GmailParser', `Gmail message ${params.gmailMessageId} already ingested (Duplicate skipped).`);
      return null;
    }
    logger.error('GmailParser', 'Error inserting pending email transaction', error, { params });
    throw error;
  }

  logger.info('GmailParser', `Created pending transaction from email`, { txId: tx.id, amount: params.amount, gmailMessageId: params.gmailMessageId });
  return tx;
}
