export function sanitizeDescription(desc?: string): string {
  if (!desc) return 'Pengeluaran';

  // 1. Remove long bank notification boilerplate patterns (Bank Jago, Mandiri, BCA, GoPay, etc.)
  let cleaned = desc
    .replace(/(silakan|klik|bantuan|Cekdetil|riwayattransaksi|aplikasiJago|KantongJago|maubikinhidup|KantongBayar|AturUangSesuaiMaumu|TanyaJago|PTBankJago|OtoritasJasaKeuangan|OJK|penjaminanLPS)[\s\S]*/gi, '')
    .trim();

  if (!cleaned) {
    cleaned = desc.slice(0, 50).trim();
  }

  // 2. Limit maximum length to 65 chars to keep output clean and readable
  if (cleaned.length > 65) {
    return cleaned.slice(0, 62).trim() + '...';
  }

  return cleaned;
}
