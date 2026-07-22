import React, { useState, useEffect, useRef } from 'react';
import { STEAM_GAMES_DATABASE, searchGames } from '../data/gamesData';
import { fetchLiveSteamReviews } from '../lib/steamService';
import confetti from 'canvas-confetti';
import { Search, HelpCircle, ArrowRight, Award, Flag, Loader2, AlertTriangle, User, SkipForward } from 'lucide-react';

const THUMB_UP_URL = 'https://steamdle.com/images/thumb-up.png';
const THUMB_DOWN_URL = 'https://steamdle.com/images/thumb-down.png';

export default function GameCard({ onScoreUpdate }) {
  const [currentGame, setCurrentGame] = useState(null);
  const [gameReviews, setGameReviews] = useState([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [reviewError, setReviewError] = useState('');
  const [clueIndex, setClueIndex] = useState(0);
  const [attemptCount, setAttemptCount] = useState(1);
  const [userGuess, setUserGuess] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [wrongGuesses, setWrongGuesses] = useState([]);
  const [gameStatus, setGameStatus] = useState('playing');
  const [pointsGained, setPointsGained] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notFoundError, setNotFoundError] = useState('');
  const [failedAvatars, setFailedAvatars] = useState({});

  const [selectedLangs, setSelectedLangs] = useState(() => {
    try {
      const saved = localStorage.getItem('steam_guesser_langs');
      return saved ? JSON.parse(saved) : ['english', 'turkish'];
    } catch {
      return ['english', 'turkish'];
    }
  });

  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  const pickNewGame = async (overrideLangs, retryCount = 0) => {
    const langsToUse = Array.isArray(overrideLangs) ? overrideLangs : selectedLangs;
    setIsLoadingReviews(true);
    setReviewError('');

    let pool = STEAM_GAMES_DATABASE;
    if (currentGame && STEAM_GAMES_DATABASE.length > 1) {
      pool = STEAM_GAMES_DATABASE.filter(g => g.id !== currentGame.id);
    }

    const randomGame = pool[Math.floor(Math.random() * pool.length)];
    setCurrentGame(randomGame);
    setClueIndex(0);
    setAttemptCount(1);
    setUserGuess('');
    setWrongGuesses([]);
    setGameStatus('playing');
    setPointsGained(0);
    setSuggestions([]);
    setShowDropdown(false);
    setNotFoundError('');
    setFailedAvatars({});

    try {
      const liveReviews = await fetchLiveSteamReviews(randomGame.id, langsToUse);
      setGameReviews(liveReviews);
      setReviewError('');
      setIsLoadingReviews(false);
    } catch (err) {
      console.warn(`Steam review fetch failed for ${randomGame.title}:`, err);
      if (retryCount < 1) {
        // Try once more with a different random game
        setIsLoadingReviews(false);
        pickNewGame(overrideLangs, retryCount + 1);
      } else {
        setGameReviews([]);
        setReviewError(`Failed to load live Steam reviews. Check your connection or try a different game.`);
        setIsLoadingReviews(false);
      }
    }
  };

  const toggleLanguage = (lang) => {
    let updated;
    if (selectedLangs.includes(lang)) {
      if (selectedLangs.length === 1) return; // Must keep at least one language selected
      updated = selectedLangs.filter(l => l !== lang);
    } else {
      updated = [...selectedLangs, lang];
    }

    setSelectedLangs(updated);
    try {
      localStorage.setItem('steam_guesser_langs', JSON.stringify(updated));
    } catch (e) {}

    // Reload reviews for current game with new language selection
    if (currentGame) {
      setIsLoadingReviews(true);
      setReviewError('');
      fetchLiveSteamReviews(currentGame.id, updated)
        .then(liveReviews => {
          setGameReviews(liveReviews);
          setReviewError('');
        })
        .catch(err => {
          console.warn(err);
          setGameReviews([]);
          setReviewError(`Could not load live Steam reviews for the selected language.`);
        })
        .finally(() => setIsLoadingReviews(false));
    }
  };

  useEffect(() => {
    pickNewGame();
  }, []);

  useEffect(() => {
    if (bottomRef.current && clueIndex > 0) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [clueIndex, gameStatus]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setUserGuess(val);
    setNotFoundError('');
    if (val.trim().length > 0) {
      setSuggestions(searchGames(val, 5));
      setShowDropdown(true);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const handleSelectSuggestion = (gameTitle) => {
    setUserGuess(gameTitle);
    setShowDropdown(false);
    setNotFoundError('');
  };

  const calculatePoints = (attempts) => Math.floor(100 / attempts);

  const submitGuess = (guessText = userGuess) => {
    if (!guessText.trim() || gameStatus !== 'playing' || !currentGame) return;
    setNotFoundError('');
    const normalizedGuess = guessText.trim().toLowerCase();

    const matchedGame = STEAM_GAMES_DATABASE.find(g =>
      g.title.toLowerCase() === normalizedGuess
    );

    if (!matchedGame) {
      setNotFoundError(`"${guessText}" was not found in the catalog. Please select a valid game from the list.`);
      return;
    }

    const isAlreadyGuessed = wrongGuesses.some(
      w => w.toLowerCase() === matchedGame.title.toLowerCase()
    );

    if (isAlreadyGuessed) {
      setNotFoundError(`"${matchedGame.title}" has already been guessed!`);
      return;
    }

    const isCorrect =
      matchedGame.id === currentGame.id ||
      normalizedGuess === currentGame.title.toLowerCase();

    if (isCorrect) {
      const points = calculatePoints(attemptCount);
      setPointsGained(points);
      setGameStatus('won');
      onScoreUpdate(points, true);
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    } else {
      setWrongGuesses(prev => [...prev, matchedGame.title]);
      setUserGuess('');
      setShowDropdown(false);
      setAttemptCount(prev => prev + 1);
      if (clueIndex < gameReviews.length - 1) {
        setClueIndex(prev => prev + 1);
      }
    }
  };

  const handlePassClue = () => {
    if (gameStatus !== 'playing' || !currentGame || isLoadingReviews || clueIndex >= gameReviews.length - 1) return;
    setNotFoundError('');
    setUserGuess('');
    setShowDropdown(false);
    setAttemptCount(prev => prev + 1);
    setClueIndex(prev => prev + 1);
  };

  const handleGiveUp = () => {
    if (gameStatus !== 'playing') return;
    setGameStatus('gave_up');
    onScoreUpdate(0, false);
  };

  if (!currentGame) return null;

  const nextPotentialPoints = calculatePoints(attemptCount);
  const revealedReviews = gameReviews.slice(0, clueIndex + 1);

  return (
    <div className="glass-card game-card" style={{ padding: '1.25rem' }}>
      {/* Top Header Clue Tracker */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span className="clue-badge" style={{ background: '#121a24', border: '1px solid var(--steam-blue-dark)', color: 'var(--steam-blue)', padding: '0.3rem 0.7rem', borderRadius: '2px', fontSize: '0.85rem' }}>
            <HelpCircle size={14} /> Reviews Shown: {revealedReviews.length} / 10
          </span>
          <span style={{ fontSize: '0.85rem', color: '#cbd5e1', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.7rem', borderRadius: '2px' }}>
            Attempts: {attemptCount}
          </span>

          {/* Language Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--steam-text-muted)', fontWeight: 600 }}>Lang:</span>
            <button
              type="button"
              onClick={() => toggleLanguage('english')}
              title="Toggle English Reviews"
              style={{
                background: selectedLangs.includes('english') ? '#66c0f4' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${selectedLangs.includes('english') ? '#66c0f4' : '#2a3a4e'}`,
                color: selectedLangs.includes('english') ? '#0f172a' : '#94a3b8',
                padding: '0.25rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 700,
                transition: 'all 0.2s'
              }}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => toggleLanguage('turkish')}
              title="Toggle Turkish Reviews"
              style={{
                background: selectedLangs.includes('turkish') ? '#66c0f4' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${selectedLangs.includes('turkish') ? '#66c0f4' : '#2a3a4e'}`,
                color: selectedLangs.includes('turkish') ? '#0f172a' : '#94a3b8',
                padding: '0.25rem 0.65rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 700,
                transition: 'all 0.2s'
              }}
            >
              TR
            </button>
          </div>
        </div>
        {gameStatus === 'playing' && (
          <div style={{ fontSize: '0.95rem', color: 'var(--accent-gold)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Award size={18} /> Potential Points: +{nextPotentialPoints}
          </div>
        )}
      </div>

      {/* Loading State or Review Error */}
      {isLoadingReviews ? (
        <div className="steam-review-card" style={{ textAlign: 'center', padding: '3rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <Loader2 size={32} color="var(--steam-blue)" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ color: 'var(--steam-text-muted)', fontSize: '0.9rem' }}>
            Fetching live Steam user reviews...
          </p>
        </div>
      ) : reviewError || gameReviews.length === 0 ? (
        <div className="steam-review-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.04)', marginBottom: '1.25rem' }}>
          <AlertTriangle size={36} color="#ef4444" />
          <div>
            <h3 style={{ color: '#ef4444', marginBottom: '0.4rem', fontSize: '1.1rem', fontWeight: 700 }}>Could Not Load Steam Reviews</h3>
            <p style={{ color: 'var(--steam-text-muted)', fontSize: '0.88rem', maxWidth: '480px', margin: '0 auto', lineHeight: '1.5' }}>
              {reviewError || 'Live Steam reviews could not be fetched for this game.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => pickNewGame()}
            className="btn-steam-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', padding: '0.55rem 1.25rem' }}
          >
            <SkipForward size={16} /> Try Another Game
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
          {revealedReviews.map((rev, idx) => (
            <div key={idx} className={`steam-review-card ${rev.recommended ? 'recommended' : 'not-recommended'}`}>
              {/* User Header with Clue Badge */}
              <div className="steam-review-user-bar" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {/* Avatar: real photo if available, question mark icon on error or null */}
                  {rev.avatar && !failedAvatars[idx] ? (
                    <img
                      src={rev.avatar}
                      alt={rev.author}
                      className="steam-avatar"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedAvatars(prev => ({ ...prev, [idx]: true }))}
                    />
                  ) : (
                    <div
                      className="steam-avatar"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#1b2838',
                        border: '1px solid #36495d',
                        color: '#8f98a0'
                      }}
                    >
                      <User size={18} />
                    </div>
                  )}
                  <span className="steam-username">{rev.author || 'Steam Player'}</span>
                </div>
                <span style={{ fontSize: '0.75rem', background: '#1b2838', color: 'var(--steam-blue)', padding: '0.2rem 0.6rem', borderRadius: '2px', border: '1px solid #2a475e', fontWeight: 'bold' }}>
                  Clue #{idx + 1}
                </span>
              </div>

              {/* Banner Bar */}
              <div className="steam-review-banner">
                <img
                  src={rev.recommended ? THUMB_UP_URL : THUMB_DOWN_URL}
                  alt={rev.recommended ? 'Recommended' : 'Not Recommended'}
                  style={{ width: '40px', height: '40px', objectFit: 'contain', flexShrink: 0 }}
                />
                <div>
                  <div className={`steam-banner-text-title ${rev.recommended ? 'recommended' : 'not-recommended'}`}>
                    {rev.recommended ? 'Recommended' : 'Not Recommended'}
                  </div>
                  <div className="steam-banner-text-hours">
                    {rev.hours ? `${rev.hours} hrs` : '1.0 hrs'} on record
                  </div>
                </div>
              </div>

              {/* Review Text */}
              <div className="steam-review-content">
                <div className="steam-posted-date">
                  Posted: {rev.postedDate || 'Jan 1 @ 8:36am'}
                </div>
                <div className="steam-review-text">
                  {rev.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input Search Container */}
      {gameStatus === 'playing' ? (
        <div className="search-container" ref={bottomRef}>
          {notFoundError && (
            <div style={{ background: 'rgba(255, 183, 3, 0.15)', border: '1px solid rgba(255, 183, 3, 0.4)', color: 'var(--accent-gold)', padding: '0.6rem 0.85rem', borderRadius: '2px', fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} />
              <span>{notFoundError}</span>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); submitGuess(); }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <input
                  ref={inputRef}
                  type="text"
                  className="input-steam"
                  placeholder="Type a game title... (e.g. Elden Ring, GTA V, Portal 2)"
                  value={userGuess}
                  onChange={handleInputChange}
                  onFocus={() => userGuess.length > 0 && setShowDropdown(true)}
                />
                <Search size={18} color="var(--steam-text-muted)" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
              <button type="submit" className="btn-primary" disabled={isLoadingReviews}>
                Guess
              </button>
              <button
                type="button"
                className="btn-steam"
                onClick={handlePassClue}
                disabled={isLoadingReviews || clueIndex >= gameReviews.length - 1}
                style={{
                  borderColor: clueIndex >= gameReviews.length - 1 ? '#334155' : 'var(--steam-blue-dark)',
                  color: clueIndex >= gameReviews.length - 1 ? '#64748b' : 'var(--steam-blue)',
                  opacity: clueIndex >= gameReviews.length - 1 ? 0.6 : 1
                }}
              >
                <SkipForward size={15} />
                <span>{clueIndex >= gameReviews.length - 1 ? 'No More Clues' : 'Pass Clue'}</span>
              </button>
              <button type="button" className="btn-steam" onClick={handleGiveUp} style={{ borderColor: 'rgba(255, 71, 87, 0.4)', color: 'var(--accent-red)' }}>
                <Flag size={15} />
                <span>Give Up</span>
              </button>
            </div>
          </form>

          {showDropdown && suggestions.length > 0 && (
            <div className="suggestions-dropdown">
              {suggestions.map((game) => (
                <div key={game.id} className="suggestion-item" onClick={() => handleSelectSuggestion(game.title)}>
                  <img src={game.coverImage} alt={game.title} style={{ width: '45px', height: '22px', objectFit: 'cover', borderRadius: '2px' }} />
                  <span style={{ fontWeight: 600 }}>{game.title}</span>
                </div>
              ))}
            </div>
          )}

          {wrongGuesses.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--steam-text-muted)' }}>Guesses ({wrongGuesses.length}):</span>
              {wrongGuesses.map((w, i) => (
                <span key={i} style={{ background: 'rgba(255, 71, 87, 0.15)', color: '#ff6b81', border: '1px solid rgba(255, 71, 87, 0.3)', padding: '0.2rem 0.6rem', borderRadius: '2px', fontSize: '0.8rem' }}>
                  ❌ {w}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={`result-banner ${gameStatus === 'won' ? 'success' : 'fail'}`} ref={bottomRef}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <img src={currentGame.coverImage} alt={currentGame.title} style={{ width: '180px', height: '85px', objectFit: 'cover', borderRadius: '4px', boxShadow: '0 5px 20px rgba(0,0,0,0.6)' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: gameStatus === 'won' ? '#4ade80' : '#ff6b81',
                marginBottom: '0.25rem'
              }}>
                {gameStatus === 'won' ? '🎉 CONGRATULATIONS!' : '🏳️ GAVE UP'}
              </div>
              <h2 style={{ fontSize: '1.75rem', color: '#ffffff', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
                {currentGame.title}
              </h2>
            </div>
          </div>

          {gameStatus === 'won' ? (
            <div>
              <p style={{ fontSize: '1rem', color: '#e2e8f0' }}>
                You guessed the game in <strong>{attemptCount} {attemptCount === 1 ? 'attempt' : 'attempts'}</strong>!
              </p>
              <div className="points-gained">+{pointsGained} PTS</div>
            </div>
          ) : (
            <p style={{ color: 'var(--steam-text-muted)', fontSize: '0.9rem' }}>
              Good luck on the next round!
            </p>
          )}

          <button className="btn-primary" onClick={() => pickNewGame()} style={{ marginTop: '1rem', padding: '0.7rem 1.8rem', fontSize: '1rem' }}>
            <span>Next Game</span>
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
