import React from 'react';
import { Trophy, User, LogOut, Flame } from 'lucide-react';

export default function Header({ user, totalScore, streak, onOpenAuth, onOpenLeaderboard, onLogout }) {
  return (
    <header className="header-bar">
      <div className="logo-area">
        <div>
          <h1 className="logo-title">Steam Review Guesser</h1>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '-2px' }}>
            Guess the game from user reviews
          </span>
        </div>
      </div>

      <div className="user-controls">
        {/* Streak & Score pills */}
        <div className="stat-pill">
          <Flame size={16} color="#ff4757" />
          <span>Streak: {streak}</span>
        </div>

        <div className="stat-pill score">
          <Trophy size={16} />
          <span>Score: {totalScore}</span>
        </div>

        {/* Leaderboard button */}
        <button className="btn-steam" onClick={onOpenLeaderboard} title="Leaderboard">
          <Trophy size={18} color="var(--accent-gold)" />
          <span>Leaderboard</span>
        </button>

        {/* Auth status */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--steam-blue)' }}>
              👤 {user.user_metadata?.username || user.email?.split('@')[0]}
            </span>
            <button className="btn-icon" onClick={onLogout} title="Log Out">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={onOpenAuth}>
            <User size={18} />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
