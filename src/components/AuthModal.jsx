import React, { useState } from 'react';
import { X, LogIn, UserPlus, KeyRound, Mail, User, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!supabase) {
      setErrorMsg('Supabase connection is not configured.');
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        // Register user with username metadata
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username || email.split('@')[0] }
          }
        });

        if (error) throw error;
        alert('Registration successful! You can now sign in.');
        setIsRegister(false);
      } else {
        // Sign in user
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        onAuthSuccess(data.user);
        onClose();
      }
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={22} />
        </button>

        <h2 style={{ fontSize: '1.5rem', color: '#ffffff', marginBottom: '0.5rem', textAlign: 'center' }}>
          {isRegister ? 'Create Account' : 'Sign In'}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem' }}>
          Save your scores to the global leaderboard!
        </p>

        {errorMsg && (
          <div style={{ background: 'rgba(255, 71, 87, 0.15)', border: '1px solid rgba(255, 71, 87, 0.4)', color: 'var(--accent-red)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isRegister && (
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Username</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  className="input-steam"
                  placeholder="e.g. SteamKing99"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
                <User size={18} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                className="input-steam"
                placeholder="example@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <Mail size={18} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                className="input-steam"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <KeyRound size={18} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ justifyContent: 'center', marginTop: '0.5rem' }} disabled={loading}>
            {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
            <span>{loading ? 'Processing...' : (isRegister ? 'Create Account' : 'Sign In')}</span>
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"} {' '}
          <button 
            type="button" 
            onClick={() => { setIsRegister(!isRegister); setErrorMsg(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--steam-blue)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
