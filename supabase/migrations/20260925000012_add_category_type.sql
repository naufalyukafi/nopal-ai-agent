-- Migration: Add category_type to categories table with smart backfill
-- Allows explicit classification into 'operational', 'fixed_bill', and 'savings'

ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'operational';

-- Add check constraint for valid category types
ALTER TABLE public.categories
DROP CONSTRAINT IF EXISTS check_category_type;

ALTER TABLE public.categories
ADD CONSTRAINT check_category_type
CHECK (type IN ('operational', 'fixed_bill', 'savings'));

-- Smart Backfill for existing categories based on category names
UPDATE public.categories
SET type = 'savings'
WHERE type = 'operational'
  AND name ~* 'tabungan|investasi|savings|deposito|dana darurat|reksa dana|portfolio';

UPDATE public.categories
SET type = 'fixed_bill'
WHERE type = 'operational'
  AND name ~* 'internet|komunikasi|telepon|pulsa|paket data|wifi|indihome|biznet|indosat|telkomsel|xl|tri|smartfren|listrik|pln|air|pdam|sewa|kos|kost|kontrakan|kpr|cicilan|asuransi|bpjs|pajak|tagihan|utilitas|laundry|subskripsi|subscription|netflix|spotify|youtube';
