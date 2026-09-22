import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env.ts';
import { getSupabaseClient } from '../db/supabase.ts';
import { logger } from '../utils/logger.ts';
import { getOrCreateCategoryByName } from '../db/budgets.db.ts';

export interface ExtractedEmailReceipt {
  isReceipt: boolean;
  amount: number;
  merchantName?: string;
  categoryName?: string;
  description?: string;
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

export async function parseEmailContentWithGemini(
  subject: string,
  snippet: string,
  body: string,
  userActiveCategories?: string[]
): Promise<ExtractedEmailReceipt> {
  const apiKey = env.GEMINI_API_KEY;
  const modelName = env.GEMINI_MODEL || 'gemini-3.6-flash';

  if (!apiKey) {
    logger.warn('GmailParser', 'GEMINI_API_KEY is not set. Skipping email parsing.');
    return { isReceipt: false, amount: 0 };
  }

  const ai = new GoogleGenAI({ apiKey });
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
4. "merchantName": Extract the payee / merchant / recipient name (e.g. "HC BRAVO BOJONEGORO", "OpenAI / ChatGPT", "GitHub").
5. "categoryName": Categorize into an appropriate category. ${catPromptList}
6. "description": A short clean summary (e.g., "Pembayaran ke HC BRAVO BOJONEGORO").
`;

  try {
    logger.info('GmailParser', `Parsing email using Gemini Structured JSON Output (${modelName})`, { subject });

    // Official Gemini Structured Output Mode (Guarantees 100% valid JSON)
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

    const result: ExtractedEmailReceipt = {
      isReceipt: Boolean(parsed.isReceipt),
      amount: idrAmount,
      merchantName: parsed.merchantName || 'Merchant',
      categoryName: parsed.categoryName || 'Lain-lain',
      description: desc,
    };

    logger.info('GmailParser', `Email parsed successfully via Gemini Structured Output`, {
      isReceipt: result.isReceipt,
      amount: result.amount,
      rawCurrency,
      merchant: result.merchantName,
      category: result.categoryName,
    });

    return result;
  } catch (err) {
    logger.error('GmailParser', 'Error parsing email content with Gemini Structured Output', err, { subject });
    return { isReceipt: false, amount: 0 };
  }
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

  const { data: tx, error } = await supabase
    .from('transactions')
    .insert({
      user_id: params.userId,
      amount: params.amount,
      category_id: categoryId,
      description: params.description,
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
