/**
 * Fast Indonesian Shorthand Expense Parser (0-Token Local Regex & Keyword Router)
 * Supports inputs like:
 * - "kopi 25k" -> { description: "Kopi", amount: 25000, categoryName: "Makanan & Minuman" }
 * - "bensin 30rb" -> { description: "Bensin", amount: 30000, categoryName: "Transportasi" }
 * - "parkir 5000" -> { description: "Parkir", amount: 5000, categoryName: "Transportasi" }
 * - "makan siang 18.5k" -> { description: "Makan siang", amount: 18500, categoryName: "Makanan & Minuman" }
 * - "pulsa 50 ribu" -> { description: "Pulsa", amount: 50000, categoryName: "Tagihan & Utilitas" }
 */

export interface ParsedQuickExpense {
  amount: number;
  description: string;
  categoryName: string;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Makanan & Minuman': [
    'kopi', 'coffee', 'cafe', 'makan', 'minum', 'sarapan', 'lunch', 'dinner',
    'nasi', 'bakso', 'mie', 'ayam', 'sate', 'jus', 'teh', 'boba', 'roti',
    'snack', 'jajan', 'martabak', 'warteg', 'padang', 'burger', 'pizza', 'soto'
  ],
  'Transportasi': [
    'bensin', 'pertalite', 'pertamax', 'solar', 'bbm', 'parkir', 'tol', 'toll',
    'gojek', 'goride', 'gocar', 'grab', 'grabfood', 'maxim', 'indrive', 'mrt',
    'krl', 'busway', 'transjakarta', 'kereta', 'tiket pesawat', 'tambal ban', 'cuci motor', 'cuci mobil'
  ],
  'Tagihan & Utilitas': [
    'listrik', 'pln', 'token', 'pulsa', 'kuota', 'paket data', 'wifi', 'indihome',
    'biznet', 'myrepublic', 'pdam', 'air', 'bpjs', 'iuran', 'kebersihan', 'sampah',
    'netflix', 'spotify', 'youtube', 'icloud', 'google one'
  ],
  'Kesehatan': [
    'obat', 'apotek', 'klinik', 'dokter', 'rumah sakit', 'vitamin', 'panadol',
    'bodrex', 'paracetamol', 'masker', 'medis'
  ],
  'Hiburan & Rekreasi': [
    'bioskop', 'cinema', 'xxi', 'game', 'steam', 'playstation', 'topup game',
    'nonton', 'karaoke', 'liburan', 'wisata'
  ],
  'Pendidikan': [
    'buku', 'kursus', 'seminar', 'les', 'ujian', 'spp', 'kuliah', 'sekolah', 'alat tulis'
  ],
};

export function inferCategoryFromDescription(desc: string): string {
  const lower = desc.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      // Match whole word or substring within spaces
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(lower) || lower.includes(kw)) {
        return category;
      }
    }
  }
  return 'Belanja';
}

/**
 * Parses user message into a quick expense if it matches shorthand structure.
 * Returns null if the text is conversational, ambiguous, or a system command.
 */
export function parseQuickExpenseInput(text: string): ParsedQuickExpense | null {
  if (!text) return null;
  const trimmed = text.trim();

  // Guard: Ignore bot commands, URLs, or long sentences (> 60 chars)
  if (trimmed.startsWith('/') || trimmed.length > 60 || trimmed.includes('http')) {
    return null;
  }

  // Guard: Ignore conversational or query patterns (ensure word boundaries so 'parkir' or 'pulsa' aren't blocked)
  if (/^(halo|hai|siapa|apa|bagaimana|berapa|kenapa|tolong|bisa|gaji|tabung|simpan|cek|lihat|tampilkan|gajian)\b/i.test(trimmed) || /^p$/i.test(trimmed)) {
    return null;
  }

  // Regex pattern matching:
  // 1. Description: letters, spaces, hyphens, and apostrophes (min 2 characters)
  // 2. Separator: whitespace
  // 3. Amount: numbers with optional decimals/commas/dots
  // 4. Unit: optional "k", "rb", "ribu"
  // Example: "kopi 25k", "bensin pertalite 30rb", "parkir 5000", "makan siang 18.5k"
  const pattern = /^([a-zA-Z\s'-]{2,}?)\s+([0-9]+(?:[.,][0-9]+)*)\s*(rb|ribu|k)?$/i;
  const match = trimmed.match(pattern);

  if (!match) {
    return null;
  }

  const rawDesc = match[1].trim();
  const rawNumStr = match[2].trim();
  const unit = (match[3] || '').toLowerCase();

  // Guard: Ensure description doesn't look like common conversational verbs/words or dates
  const lowerDesc = rawDesc.toLowerCase();
  if (/gaji|gajian|tanggal|tabung|investasi|bonus|limit|budget/i.test(lowerDesc)) {
    return null;
  }

  let numericValue = 0;

  if (unit === 'k' || unit === 'rb' || unit === 'ribu') {
    // Replace comma with dot for decimal parsing (e.g. 18,5k -> 18.5k)
    const normalized = rawNumStr.replace(',', '.');
    const parsedFloat = parseFloat(normalized);
    if (isNaN(parsedFloat) || parsedFloat <= 0) return null;
    numericValue = Math.round(parsedFloat * 1000);
  } else {
    // If no unit, check if dot/comma is thousands separator (e.g. 25.000 or 25,000)
    if (/[.,]\d{3}$/.test(rawNumStr)) {
      const cleanInt = rawNumStr.replace(/[.,]/g, '');
      numericValue = parseInt(cleanInt, 10);
    } else {
      const parsed = parseFloat(rawNumStr.replace(',', '.'));
      if (isNaN(parsed) || parsed <= 0) return null;
      numericValue = Math.round(parsed);
    }

    // Guard: A plain number without unit (e.g. "25") must be at least 500 IDR to avoid date confusion
    if (numericValue < 500) {
      return null;
    }
  }

  // Validate amount boundary (e.g., between Rp 100 and Rp 100.000.000)
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > 100_000_000) {
    return null;
  }

  // Capitalize description nicely
  const capitalizedDesc = rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1);
  const categoryName = inferCategoryFromDescription(rawDesc);

  return {
    amount: numericValue,
    description: capitalizedDesc,
    categoryName,
  };
}
