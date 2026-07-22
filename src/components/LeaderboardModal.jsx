import React, { useState, useEffect } from 'react';
import { X, Trophy, Medal, Award, RefreshCw, UserCheck } from 'lucide-react';
import { fetchLeaderboard, supabase } from '../lib/supabaseClient';

export default function LeaderboardModal({ isOpen, onClose, currentUser }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    if (supabase) {
      const data = await fetchLeaderboard();
      setPlayers(data);
    } else {
      // Mock leaderboard if Supabase is not configured yet
      setPlayers([
        { id: '1', username: 'GabeN_Official', total_score: 1450, games_played: 18 },
        { id: '2', username: 'SteamMaster99', total_score: 1200, games_played: 15 },
        { id: '3', username: 'NoobMaster69', total_score: 850, games_played: 12 },
        { id: '4', username: 'ReviewHunter', total_score: 620, games_played: 9 },
        { id: '5', username: 'GamerGirl_TR', total_score: 410, games_played: 7 }
      ]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={22} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'rgba(255, 183, 3, 0.15)', padding: '0.6rem', borderRadius: '12px', color: 'var(--accent-gold)' }}>
            <Trophy size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', color: '#ffffff' }}>Global Leaderboard</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {supabase ? 'Live player rankings' : 'Sample Rankings'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <button className="btn-steam" onClick={loadData} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ textTransform: 'uppercase', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Loading...
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="lb-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Total Score</th>
                  <th>Games</th>
                </tr>
              </thead>
              <tbody>
                {players.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                      No scores recorded yet. Play a game to score points!
                    </td>
                  </tr>
                ) : (
                  players.map((player, idx) => {
                    const isMe = currentUser && (currentUser.id === player.id || currentUser.email?.split('@')[0] === player.username);
                    const rank = idx + 1;

                    return (
                      <tr key={player.id || idx} style={{ background: isMe ? 'rgba(102, 192, 244, 0.15)' : 'transparent' }}>
                        <td>
                          {rank === 1 && <span className="rank-badge rank-1">🥇</span>}
                          {rank === 2 && <span className="rank-badge rank-2">🥈</span>}
                          {rank === 3 && <span className="rank-badge rank-3">🥉</span>}
                          {rank > 3 && <span style={{ fontWeight: 600, paddingLeft: '0.4rem' }}>#{rank}</span>}
                        </td>
                        <td style={{ fontWeight: 700, color: isMe ? 'var(--steam-blue)' : '#ffffff' }}>
                          {player.username} {isMe && <span style={{ fontSize: '0.75rem', background: 'var(--steam-blue)', color: '#000', padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: '0.3rem' }}>YOU</span>}
                        </td>
                        <td style={{ color: 'var(--accent-gold)', fontWeight: 800 }}>
                          {player.total_score}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          {player.games_played || 0}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
