export function sanitizeDescription(desc?: string): string {
  if (!desc) return 'Pengeluaran';

  // 1. Remove long series of zeroes (4 or more zeroes) often found in system ref IDs
  let cleaned = desc.replace(/0{4,}/g, ' ');

  // 2. Remove long bank/app notification boilerplate patterns (Bank Jago, Mandiri, BCA, GoPay, etc.)
  cleaned = cleaned
    .replace(/(silakan|klik|bantuan|Cekdetil|riwayattransaksi|aplikasiJago|KantongJago|maubikinhidup|KantongBayar|AturUangSesuaiMaumu|TanyaJago|PTBankJago|OtoritasJasaKeuangan|OJK|penjaminanLPS)[\s\S]*/gi, '')
    .replace(/[\/\-_:]\s*$/g, '')
    .replace(/^\s*[\/\-_:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    cleaned = desc.slice(0, 50).trim();
  }

  // 3. Limit maximum length to 65 chars to keep Telegram output clean and readable
  if (cleaned.length > 65) {
    return cleaned.slice(0, 62).trim() + '...';
  }

  return cleaned;
}
