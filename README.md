# 🎮 Steam Review Guesser

Steam oyunlarının kullanıcı yorumlarından oyunu tahmin etme web uygulaması!

## 🌟 Özellikler
- **Puanlama Sistemi**: Oyunu kaçıncı yorumda bilirsen `100 / Tahmin_Sayısı` kadar puan kazanırsın!
  - 1. deneme: 100 Puan
  - 2. deneme: 50 Puan
  - 3. deneme: 33 Puan
  - 4. deneme: 25 Puan
- **Supabase Entegrasyonu**: Kullanıcı kaydı/girişi (Auth) ve canlı Liderlik Tablosu (Leaderboard).
- **Hile Koruması (Anti-Cheat)**: Supabase SQL Store Procedure (`add_score`) ile güvenli puan güncelleme.
- **GitHub Pages Uyumlu**: Statik web sitesi olarak GitHub üzerinde 0 masrafla yayınlanabilir.

---

## ⚡ Supabase SQL Kurulum Kodu (Tüm Güvenlik Önlemleri Dahil)

Supabase Dashboard panelinize girip sol menüdeki **SQL Editor** sekmesine tıklayın. **New Query** deyin ve aşağıdaki kodun tamamını kopyalayıp **Run** butonuna basın:

```sql
-- ==========================================
-- STEAM REVIEW GUESSER - GÜVENLİ SUPABASE KODU
-- ==========================================

-- 1. PROFILLER TABLOSUNU OLUŞTUR
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    total_score INT DEFAULT 0,
    high_score INT DEFAULT 0,
    games_played INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. GÜVENLİK (ROW LEVEL SECURITY) ETKİNLEŞTİR
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Okuma Yetkisi: Herkes sıralama tablosunu görebilir
CREATE POLICY "Herkes profilleri görebilir" ON public.profiles
    FOR SELECT USING (true);

-- Ekleme/Güncelleme Yetkisi: Kullanıcı kendi profilini yönetebilir
CREATE POLICY "Kullanıcı kendi profilini yönetebilir" ON public.profiles
    FOR ALL USING (auth.uid() = id);

-- 3. HİLE ÖNLEYİCİ PUAN EKLEME FONKSİYONU (RPC)
CREATE OR REPLACE FUNCTION add_score(points_to_add INT)
RETURNS VOID AS $$
BEGIN
    -- Güvenlik Kontrolü: 1 turda 100 puandan fazla veya 0'dan küçük puan verilemez!
    IF points_to_add > 100 OR points_to_add <= 0 THEN
        RAISE EXCEPTION 'Geçersiz puan miktarı!';
    END IF;

    UPDATE public.profiles
    SET 
        total_score = total_score + points_to_add,
        high_score = GREATEST(high_score, points_to_add),
        games_played = games_played + 1,
        updated_at = NOW()
    WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 🚀 GitHub Pages Üzerinde Barındırma (Deployment Guide)

1. Projeyi bir GitHub reposuna push edin:
```bash
git init
git add .
git commit -m "Initial commit - Steam Review Guesser"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADI/steam-guesser.git
git push -u origin main
```

2. GitHub repository sayfanızda **Settings > Pages** sekmesine gidin.
3. **Source** kısmında **GitHub Actions**'ı seçin veya build çıktısını (`dist`) yayınlayın.
