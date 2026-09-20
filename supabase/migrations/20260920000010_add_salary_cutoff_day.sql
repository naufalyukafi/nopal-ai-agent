-- Add salary_cutoff_day to users table to support flexible salary budget cycles (e.g. 25th of month)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS salary_cutoff_day int DEFAULT 1 CHECK (salary_cutoff_day BETWEEN 1 AND 31);
