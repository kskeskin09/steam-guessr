import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import GameCard from './components/GameCard';
import LeaderboardModal from './components/LeaderboardModal';
import AuthModal from './components/AuthModal';
import { supabase, saveUserScore, mergeGuestStats } from './lib/supabaseClient';

export default function App() {
  const [user, setUser] = useState(null);
  const [totalScore, setTotalScore] = useState(0);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [streak, setStreak] = useState(0);

  // Guest session stats tracking (before login)
  const [guestScore, setGuestScore] = useState(() => {
    return parseInt(sessionStorage.getItem('steam_guesser_guest_score') || '0', 10);
  });
  const [guestGames, setGuestGames] = useState(() => {
    return parseInt(sessionStorage.getItem('steam_guesser_guest_games') || '0', 10);
  });

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  // Handle user login and merge any guest session stats
  const lastProcessedUserIdRef = useRef(null);

  const handleUserLogin = async (loggedInUser) => {
    if (!loggedInUser || !supabase) return;
    // Skip if same user was already processed (avoids game reset on token refresh)
    if (lastProcessedUserIdRef.current === loggedInUser.id) return;
    lastProcessedUserIdRef.current = loggedInUser.id;

    setUser(loggedInUser);

    const sScore = parseInt(sessionStorage.getItem('steam_guesser_guest_score') || '0', 10) || guestScore;
    const sGames = parseInt(sessionStorage.getItem('steam_guesser_guest_games') || '0', 10) || guestGames;

    if (sScore > 0 || sGames > 0) {
      await mergeGuestStats(loggedInUser, sScore, sGames);

      // Clear guest session data after successful merge
      setGuestScore(0);
      setGuestGames(0);
      sessionStorage.removeItem('steam_guesser_guest_score');
      sessionStorage.removeItem('steam_guesser_guest_games');
    }

    loadUserInitialScore(loggedInUser.id);
  };

  // Check current logged in user
  useEffect(() => {
    if (supabase) {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user) {
          handleUserLogin(data.user);
        } else {
          // Keep guest score and games in display if not logged in
          setTotalScore(guestScore);
          setGamesPlayed(guestGames);
        }
      });

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        // Ignore token refreshes (fires when switching back to tab) and other background events
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;

        const u = session?.user || null;
        if (u) {
          handleUserLogin(u);
        } else {
          setUser(null);
        }
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
      .select('total_score, games_played')
      .eq('id', userId)
      .single();

    if (data) {
      if (data.total_score !== undefined) setTotalScore(data.total_score);
      if (data.games_played !== undefined) setGamesPlayed(data.games_played);
    }
  };

  const handleScoreUpdate = async (pointsGained, isWin) => {
    if (user) {
      setGamesPlayed(prev => prev + 1);

      // Logged-in user: save directly to Supabase
      if (isWin) {
        setTotalScore(prev => prev + pointsGained);
        setStreak(prev => prev + 1);
        if (supabase) await saveUserScore(user, pointsGained);
      } else {
        setStreak(0);
        if (supabase) await saveUserScore(user, 0); // Increment games played
      }
    } else {
      // Guest user: save to session state & sessionStorage
      const newGames = guestGames + 1;
      setGuestGames(newGames);
      setGamesPlayed(newGames);
      sessionStorage.setItem('steam_guesser_guest_games', String(newGames));

      if (isWin) {
        const newScore = guestScore + pointsGained;
        setGuestScore(newScore);
        setTotalScore(newScore);
        setStreak(prev => prev + 1);
        sessionStorage.setItem('steam_guesser_guest_score', String(newScore));
      } else {
        setStreak(0);
      }
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      lastProcessedUserIdRef.current = null;
      setUser(null);
      setTotalScore(0);
      setGamesPlayed(0);
      setStreak(0);
      setGuestScore(0);
      setGuestGames(0);
      sessionStorage.removeItem('steam_guesser_guest_score');
      sessionStorage.removeItem('steam_guesser_guest_games');
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
        <GameCard user={user} onScoreUpdate={handleScoreUpdate} />
      </main>

      {/* Footer */}
      <footer style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>
        <p>Steam Review Guesser • Built with React & Supabase</p>
      </footer>

      {/* Modals */}
      <AuthModal 
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(u) => { handleUserLogin(u); setIsAuthOpen(false); }}
      />

      <LeaderboardModal 
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        currentUser={user}
      />
    </div>
  );
}

