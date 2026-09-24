# 📋 Nopal AI Agent — Product & Technical Backlog

Dokumen ini mencatat rencana fitur masa depan (*future enhancements*), ide strategis, dan roadmap pengembangan untuk **Nopal AI Agent** yang sengaja ditunda (*on-hold/backlog*) agar tim/developer dapat fokus pada stabilitas fitur inti (*core habit & expense tracking*).

---

## 🧭 Roadmap Overview

```
[Phase 1: Fondasi & Habit Building] (SEKARANG)
  ├── Telegram Bot Quick Expense & Batch Logging
  ├── Gmail Auto-Sync & Human-in-the-Loop Confirmation
  ├── Budget Limit, Dynamic Daily Cap, & Morning Briefing
  └── Stabilisasi Data & Database Integrity
         │
         ▼ (Setelah 1–2 bulan konsisten)
[Phase 2: Literacy & Proactive Insights]
  └── 📰 Financial Literacy & Smart Digest Engine (RSS + Gemini Flash)
         │
         ▼ (Setelah 2–4 bulan data historis terkumpul)
[Phase 3: Visual Analytics & Deep Dive]
  └── 📊 Interactive HTML / Web Financial Analytics Dashboard
```

---

## 📌 Backlog Items

### 1. 📊 Interactive HTML / Web Analytics Dashboard
* **Status:** 🟡 `Backlog / On-Hold`
* **Estimasi Eksekusi:** **2–4 Bulan ke Depan** (Q4 2026 / saat data transaksi sudah matang)
* **Prioritas:** Medium - High (Analitik Visual)
* **Kompleksitas:** Sedang

#### 🎯 Mengapa Ditunda 2–4 Bulan?
Dashboard visual (grafik batang, pie chart, line chart tren cashflow) **memerlukan data transaksi historis yang cukup (minimal 60–90 hari)** agar grafik tidak kosong dan tren pengeluaran bulanan memiliki signifikansi statistik. Membuat dashboard sekarang saat data masih sedikit akan menghasilkan visualisasi yang hampa.

#### 💡 Rencana Spesifikasi & Fitur:
1. **Interactive Charts:**
   - **Monthly Spend vs Budget:** Progress bar dan breakdown kategori (Food, Bills, Lifestyle, dll).
   - **Cashflow & Burn Rate:** Grafik pengeluaran harian vs batas harian aman (*smart daily limit*).
   - **Category Distribution:** Donut/Pie chart pengeluaran per siklus gajian.
2. **Access & Security:**
   - Single-user web interface yang aman, terhubung langsung ke Supabase PostgreSQL menggunakan Row Level Security (RLS) atau temporary magic link / Telegram login verification.
3. **Data Export:**
   - Fitur download data transaksi ke format CSV / Excel / PDF untuk pembukuan tahunan / SPT pajak.
4. **Teknologi yang Dipertimbangkan:**
   - Next.js / Vite SPA + Chart.js / Recharts + Tailwind / Vanilla CSS modern, dideploy gratis di Vercel atau Cloudflare Pages.

---

### 2. 📰 Financial Literacy & Smart Digest Engine ("Melek Finansial")
* **Status:** 🟡 `Backlog / On-Hold`
* **Estimasi Eksekusi:** **1–2 Bulan ke Depan** (setelah habit pencatatan harian via Telegram & Gmail berjalan otomatis)
* **Prioritas:** Medium (Value-Add & Mindset)
* **Kompleksitas:** Rendah - Sedang

#### 🎯 Mengapa Ditunda?
1. **Fokus Inti:** Kunci utama melek finansial berawal dari **disiplin mengetahui ke mana uang mengalir**. Berita dan teori investasi belum efektif jika kebocoran pengeluaran harian belum terkontrol.
2. **Menjaga Efisiensi Agent:** Menghindari *prompt bloat* dan menjaga Nopal Agent di Telegram tetap responsif (< 1 detik), hemat token, dan fokus pada pencatatan akuntansi.

#### 💡 Solusi Arsitektur yang Direkomendasikan:
* **Hindari:** Gemini Google Search Grounding langsung di chat loop (biaya mahal: ~$35 / 1.000 query dan sarat *noise* pasar).
* **Solusi Efisien (Biaya ~ Rp 0):**
  - **Data Ingestion:** Tarik 2–3 artikel terhangat via RSS Feed gratis (CNBC Indonesia, Bisnis.com, Bareksa, Kontan, atau Investopedia).
  - **Processing:** Kirim teks artikel ke **Gemini 1.5 / 2.0 Flash** untuk disintesis menjadi format:
    1. *TL;DR 3 Poin Inti*
    2. *Istilah Finansial Penting (Literasi Pemula)*
    3. *Dampaknya ke Dompet / Keuangan Pribadi*
  - **Delivery:** Dijalankan secara terpisah via **Scheduled Cron (Weekly Sunday Digest)** langsung ke Telegram, bukan lewat interaksi chat manual.
* **Integrasi Lanjutan (Hyper-Personalized):**
  - Mengombinasikan edukasi finansial dengan profil pengeluaran pribadi (misal: tips investasi reksadana/SBN saat user berhasil menghemat budget di bulan berjalan).

---

### 3. 📸 Multi-Bank & Physical Receipt OCR Scanning (Foto Struk Telegram)
* **Status:** 🟡 `Backlog / On-Hold`
* **Estimasi Eksekusi:** **2–3 Bulan ke Depan**
* **Prioritas:** Low - Medium (Convenience)
* **Kompleksitas:** Sedang

#### 💡 Rencana Spesifikasi:
1. **Camera Ingestion:** Pengguna dapat memfoto struk belanja fisik (Indomaret, Resto, Parkir, Bensin) lalu mengirimnya langsung ke Bot Telegram.
2. **Gemini Flash Vision:** Memanfaatkan kapabilitas *multimodal vision* `gemini-3.5-flash-lite` untuk memproses gambar struk, mengekstrak total nominal, merchant, dan mendeteksi kategori secara otomatis (0.8s).

---

### 4. 🔔 Recurring Subscription & Bill Reminder Engine (Pengingat Tagihan Rutin)
* **Status:** 🟡 `Backlog / On-Hold`
* **Estimasi Eksekusi:** **1–2 Bulan ke Depan**
* **Prioritas:** Medium (Prevention)
* **Kompleksitas:** Rendah - Sedang

#### 💡 Rencana Spesifikasi:
1. **Automatic Pattern Detection:** Agen secara otomatis mendeteksi transaksi rutin bulanan (seperti IndiHome, Netflix, Spotify, Listrik PLN, Kos, Asuransi).
2. **Proactive Reminder:** Mengirim notifikasi H-3 sebelum tanggal gajian / jatuh tempo tagihan di Telegram agar jatah anggaran tidak terpakai secara tidak sengaja.

---

### 5. 📑 Monthly Financial Statement & Data Export (CSV / PDF)
* **Status:** 🟡 `Backlog / On-Hold`
* **Estimasi Eksekusi:** **1 Bulan ke Depan**
* **Prioritas:** Medium (Utility)
* **Kompleksitas:** Rendah

#### 💡 Rencana Spesifikasi:
1. **Command `/export`:** Mengirimkan file CSV / PDF laporan keuangan bulanan langsung di chat Telegram untuk arsip pribadi atau pembukuan tahunan.

---

## 📋 Matriks Prioritas Backlog

| Item | Kategori | Syarat Mulai (*Prerequisites*) | Estimasi Waktu | Cost Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Financial Literacy Digest** | Retention & Mindset | Habit pencatatan harian aktif & stabil 3–4 minggu berturut-turut | 1–2 Bulan | Sangat Rendah (RSS + Gemini Flash free tier) |
| **Recurring Bill Reminders** | Automation & Prevention | Memiliki data histori transaksi 1–2 bulan | 1–2 Bulan | Sangat Rendah (Crons internal) |
| **Data Export (CSV/PDF)** | Utility & Archiving | Data transaksi tercatat beberapa minggu | 1 Bulan | Nol (Pure local generator) |
| **OCR Receipt Scanning** | Ingestion Engine | Kebutuhan catat struk fisik via foto Telegram | 2–3 Bulan | Rendah (Gemini Flash Vision) |
| **HTML / Web Dashboard** | Reporting & UI | Minimal 2–3 siklus gajian (~60–90 hari transaksi) tercatat di database | 2–4 Bulan | Sangat Rendah (Static hosting + Supabase) |

---

## ✅ Kriteria Pindah ke Status "In-Progress" (Definition of Ready)
Sebuah item backlog di atas baru boleh dieksekusi jika:
1. **Fitur inti saat ini sudah stabil:** Tidak ada bug kritis pada Telegram Webhook, Gmail Polling, dan Budget Calculation.
2. **Kebutuhan data terpenuhi:** Terutama untuk dashboard web yang mewajibkan volume data riil.
3. **Arsitektur tidak mengorbankan performa bot:** Tidak menambah latensi atau biaya yang tidak perlu pada sistem yang sudah berjalan.
