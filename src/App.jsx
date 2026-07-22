import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import GameCard from './components/GameCard';
import LeaderboardModal from './components/LeaderboardModal';
import AuthModal from './components/AuthModal';
import { supabase, saveUserScore } from './lib/supabaseClient';

export default function App() {
  const [user, setUser] = useState(null);
  const [totalScore, setTotalScore] = useState(0);
  const [streak, setStreak] = useState(0);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  // Check current logged in user
  useEffect(() => {
    if (supabase) {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user) {
          setUser(data.user);
          loadUserInitialScore(data.user.id);
        }
      });

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user || null;
        setUser(u);
        if (u) loadUserInitialScore(u.id);
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  const loadUserInitialScore = async (userId) => {
    if (!supabase || !userId) return;
    const { data } = await supabase
      .from('profiles')
      .select('total_score')
      .eq('id', userId)
      .single();

    if (data && data.total_score !== undefined) {
      setTotalScore(data.total_score);
    }
  };

  const handleScoreUpdate = async (pointsGained, isWin) => {
    if (isWin) {
      const newScore = totalScore + pointsGained;
      setTotalScore(newScore);
      setStreak(prev => prev + 1);

      // Save score to Supabase if logged in
      if (user && supabase) {
        await saveUserScore(user, pointsGained);
      }
    } else {
      // Loss or Give Up resets streak
      setStreak(0);
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setUser(null);
    }
  };

  return (
    <div className="app-container">
      <Header 
        user={user}
        totalScore={totalScore}
        streak={streak}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
        onLogout={handleLogout}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Main Game Arena */}
        <GameCard onScoreUpdate={handleScoreUpdate} />
      </main>

      {/* Footer */}
      <footer style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>
        <p>Steam Review Guesser • Built with React & Supabase</p>
      </footer>

      {/* Modals */}
      <AuthModal 
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(u) => { setUser(u); setIsAuthOpen(false); }}
      />

      <LeaderboardModal 
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        currentUser={user}
      />
    </div>
  );
}
