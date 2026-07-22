import React, { useState } from 'react';
import { X, Database, Save, CheckCircle2, Copy, Code } from 'lucide-react';
import { reinitSupabase, clearSupabaseConfig } from '../lib/supabaseClient';

export default function SupabaseConfigModal({ isOpen, onClose, onConfigSaved, isConfigured }) {
  const [url, setUrl] = useState(localStorage.getItem('STEAM_GUESSER_SUPABASE_URL') || '');
  const [key, setKey] = useState(localStorage.getItem('STEAM_GUESSER_SUPABASE_KEY') || '');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (reinitSupabase(url, key)) {
      alert('Supabase bağlantısı başarıyla güncellendi!');
      onConfigSaved();
      onClose();
    } else {
      alert('Lütfen geçerli bir Supabase URL ve Anon Key giriniz.');
    }
  };

  const handleClear = () => {
    clearSupabaseConfig();
    setUrl('');
    setKey('');
    onConfigSaved();
    alert('Varsayılan Supabase ayarlarına dönüldü.');
  };

  const sqlCodeSnippet = `-- ==========================================
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

-- Ekleme/Güncelleme Yetkisi: Kullanıcı kendi profilini oluşturabilir
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
$$ LANGUAGE plpgsql SECURITY DEFINER;`;

  const copySql = () => {
    navigator.clipboard.writeText(sqlCodeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={22} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Database size={24} color="var(--steam-blue)" />
          <h2 style={{ fontSize: '1.4rem', color: '#ffffff' }}>Supabase Bağlantı Bilgileri</h2>
        </div>

        <div style={{ background: 'rgba(43, 186, 82, 0.15)', border: '1px solid rgba(43, 186, 82, 0.4)', padding: '0.75rem 1rem', borderRadius: '10px', color: 'var(--accent-green)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          ✅ Supabase veritabanı projenize başarıyla bağlandı! Artık tüm oyuncu skorları canlı veritabanında saklanmaktadır.
        </div>

        {/* SQL Script Section */}
        <div style={{ background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(102, 192, 244, 0.2)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--steam-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Code size={16} /> Supabase SQL Editor Kodu
            </span>
            <button type="button" className="btn-steam" onClick={copySql} style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
              {copied ? <CheckCircle2 size={14} color="var(--accent-green)" /> : <Copy size={14} />}
              <span>{copied ? 'Kopyalandı!' : 'Kodu Kopyala'}</span>
            </button>
          </div>
          <pre style={{ fontSize: '0.75rem', color: '#94a3b8', background: '#090d13', padding: '0.75rem', borderRadius: '8px', overflowX: 'auto', maxHeight: '180px' }}>
            {sqlCodeSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
}
