import { createClient } from '@supabase/supabase-js';

// Default Supabase project credentials
const DEFAULT_URL = "https://wgsjygplvgukrqmfcjtf.supabase.co";
const DEFAULT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnc2p5Z3Bsdmd1a3JxbWZjanRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjcxNjIsImV4cCI6MjEwMDMwMzE2Mn0.KBuQDPmrVozT7GJnPJJnxJnREqhSGmO3gFGmpd6l68Y";

const getStoredConfig = () => {
  const url = localStorage.getItem('STEAM_GUESSER_SUPABASE_URL') || import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
  const key = localStorage.getItem('STEAM_GUESSER_SUPABASE_KEY') || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_KEY;
  return { url, key };
};

let { url: CURRENT_URL, key: CURRENT_KEY } = getStoredConfig();

export let supabase = createClient(CURRENT_URL, CURRENT_KEY);

export const reinitSupabase = (url, key) => {
  if (!url || !key) return false;
  try {
    localStorage.setItem('STEAM_GUESSER_SUPABASE_URL', url);
    localStorage.setItem('STEAM_GUESSER_SUPABASE_KEY', key);
    supabase = createClient(url, key);
    return true;
  } catch (err) {
    console.error("Supabase init error:", err);
    return false;
  }
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('STEAM_GUESSER_SUPABASE_URL');
  localStorage.removeItem('STEAM_GUESSER_SUPABASE_KEY');
  supabase = createClient(DEFAULT_URL, DEFAULT_KEY);
};

// Secure score save via RPC or upsert
export const saveUserScore = async (user, pointsGained) => {
  if (!supabase || !user) return null;

  try {
    const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Oyuncu';

    // 1. Ensure profile row exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: user.id,
        username: username,
        total_score: pointsGained,
        games_played: 1
      });
      return;
    }

    // 2. Call secure stored procedure add_score
    const { error: rpcError } = await supabase.rpc('add_score', {
      points_to_add: pointsGained
    });

    if (rpcError) {
      console.warn("RPC failed, falling back to direct update:", rpcError);
      // Fallback update if RPC function not created yet
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const currentTotal = profile?.total_score || 0;
      const currentGames = profile?.games_played || 0;

      await supabase.from('profiles').update({
        username: username,
        total_score: currentTotal + pointsGained,
        games_played: currentGames + 1,
        updated_at: new Date().toISOString()
      }).eq('id', user.id);
    }
  } catch (e) {
    console.error("Failed to save score to Supabase:", e);
  }
};

// Merge guest score and games played into user profile when logging in or signing up
export const mergeGuestStats = async (user, guestScore, guestGames) => {
  if (!supabase || !user) return null;
  if (guestScore <= 0 && guestGames <= 0) return null;

  try {
    const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Oyuncu';

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, total_score, games_played')
      .eq('id', user.id)
      .single();

    const addScore = Math.max(0, guestScore);
    const addGames = Math.max(0, guestGames);

    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: user.id,
        username: username,
        total_score: addScore,
        games_played: addGames
      });
      return;
    }

    const currentTotal = existingProfile.total_score || 0;
    const currentGames = existingProfile.games_played || 0;

    await supabase.from('profiles').update({
      username: username,
      total_score: currentTotal + addScore,
      games_played: currentGames + addGames,
      updated_at: new Date().toISOString()
    }).eq('id', user.id);
  } catch (e) {
    console.error("Failed to merge guest stats into Supabase profile:", e);
  }
};

// Fetch Leaderboard
export const fetchLeaderboard = async () => {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, total_score, games_played')
      .order('total_score', { ascending: false })
      .limit(50);

    if (error) {
      console.error("Leaderboard fetch error:", error);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error("Error fetching leaderboard:", e);
    return [];
  }
};
