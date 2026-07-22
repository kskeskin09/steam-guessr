import React, { useState, useEffect, useRef } from 'react';
import { STEAM_GAMES_DATABASE, searchGames, findBestMatchGame } from '../data/gamesData';
import { fetchLiveSteamReviews, fetchSteamUserLibrary } from '../lib/steamService';
import { saveUserSteamId, getUserSteamId } from '../lib/supabaseClient';
import confetti from 'canvas-confetti';
import { 
  Search, HelpCircle, ArrowRight, Award, Flag, Loader2, 
  AlertTriangle, User, SkipForward, Gamepad2, Library, 
  Edit3, CheckCircle2, RefreshCw, X, Globe, Settings 
} from 'lucide-react';

const THUMB_UP_URL = 'https://steamdle.com/images/thumb-up.png';
const THUMB_DOWN_URL = 'https://steamdle.com/images/thumb-down.png';

export default function GameCard({ user, onScoreUpdate }) {
  // Game Mode: 'all' or 'steam_library'
  const [gameMode, setGameMode] = useState(() => {
    return localStorage.getItem('steam_guesser_game_mode') || 'all';
  });

  // Steam Library State
  const [steamId, setSteamId] = useState('');
  const [inputSteamId, setInputSteamId] = useState('');
  const [isEditingSteamId, setIsEditingSteamId] = useState(false);
  const [isFetchingLibrary, setIsFetchingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [userLibraryInfo, setUserLibraryInfo] = useState(null);
  const [userLibraryGames, setUserLibraryGames] = useState([]);

  // Gameplay state
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

  const handleGameImageError = (e, gameId) => {
    if (!e.target.dataset.triedFallback1) {
      e.target.dataset.triedFallback1 = 'true';
      e.target.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${gameId}/header.jpg`;
    } else if (!e.target.dataset.triedFallback2) {
      e.target.dataset.triedFallback2 = 'true';
      e.target.src = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${gameId}/capsule_231x87.jpg`;
    } else {
      e.target.style.display = 'none';
    }
  };

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

  // Load Steam ID on mount or user change
  useEffect(() => {
    let active = true;

    const initSteamId = async () => {
      let savedId = null;

      if (user) {
        savedId = await getUserSteamId(user.id);
      }
      if (!savedId) {
        savedId = localStorage.getItem('steam_guesser_steam_id');
      }

      if (active && savedId) {
        setSteamId(savedId);
        setInputSteamId(savedId);
        loadLibrary(savedId);
      } else if (active && gameMode === 'steam_library') {
        setIsEditingSteamId(true);
      }
    };

    initSteamId();

    return () => { active = false; };
  }, [user?.id]);

  // Load owned Steam games library
  const loadLibrary = async (targetSteamId) => {
    const idToFetch = targetSteamId || steamId || inputSteamId;
    if (!idToFetch || !idToFetch.trim()) {
      setLibraryError('Please provide a valid Steam ID or Custom Profile URL.');
      setIsEditingSteamId(true);
      return;
    }

    setIsFetchingLibrary(true);
    setLibraryError('');

    const res = await fetchSteamUserLibrary(idToFetch);

    if (!res.success) {
      setLibraryError(res.error);
      setIsFetchingLibrary(false);
      // Only clear library data if it's a fresh sync attempt (not a resync of same ID)
      if (targetSteamId !== steamId) {
        setUserLibraryGames([]);
        setUserLibraryInfo(null);
      }
      return;
    }

    const ownedSet = new Set(res.ownedAppIds.map(id => String(id)));
    const matchedGames = STEAM_GAMES_DATABASE.filter(g => ownedSet.has(String(g.id)));

    const libInfo = {
      personaName: res.personaName,
      avatar: res.avatar,
      totalOwned: res.totalOwned,
      matchedCount: matchedGames.length,
    };

    setUserLibraryGames(matchedGames);
    setUserLibraryInfo(libInfo);
    setSteamId(res.steamId);
    setInputSteamId(res.steamId);
    setIsEditingSteamId(false);
    setIsFetchingLibrary(false);

    // Persist Steam ID
    localStorage.setItem('steam_guesser_steam_id', res.steamId);
    if (user) {
      saveUserSteamId(user, res.steamId);
    }

    if (matchedGames.length > 0 && gameMode === 'steam_library') {
      pickNewGame(selectedLangs, 0, 'steam_library', matchedGames);
    }
  };

  // Main game picking logic
  const pickNewGame = async (overrideLangs, retryCount = 0, overrideMode, overrideLibraryGames) => {
    const modeToUse = overrideMode || gameMode;
    const langsToUse = Array.isArray(overrideLangs) ? overrideLangs : selectedLangs;

    setIsLoadingReviews(true);
    setReviewError('');

    let pool = STEAM_GAMES_DATABASE;
    if (modeToUse === 'steam_library') {
      pool = overrideLibraryGames || userLibraryGames;
      if (!pool || pool.length === 0) {
        setCurrentGame(null);
        setIsLoadingReviews(false);
        return;
      }
    }

    let selectablePool = pool;
    if (currentGame && pool.length > 1) {
      selectablePool = pool.filter(g => String(g.id) !== String(currentGame.id));
    }

    const randomGame = selectablePool[Math.floor(Math.random() * selectablePool.length)];
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
        setIsLoadingReviews(false);
        pickNewGame(overrideLangs, retryCount + 1, modeToUse, pool);
      } else {
        setGameReviews([]);
        setReviewError(`Failed to load live Steam reviews for ${randomGame.title}. Please check your internet connection or try another game.`);
        setIsLoadingReviews(false);
      }
    }
  };

  const handleModeSwitch = (newMode) => {
    setGameMode(newMode);
    localStorage.setItem('steam_guesser_game_mode', newMode);

    if (newMode === 'steam_library') {
      if (!steamId) {
        setIsEditingSteamId(true);
      } else if (userLibraryGames.length > 0) {
        pickNewGame(selectedLangs, 0, 'steam_library', userLibraryGames);
      } else {
        loadLibrary(steamId);
      }
    } else {
      pickNewGame(selectedLangs, 0, 'all');
    }
  };

  const toggleLanguage = (lang) => {
    let updated;
    if (selectedLangs.includes(lang)) {
      if (selectedLangs.length === 1) return;
      updated = selectedLangs.filter(l => l !== lang);
    } else {
      updated = [...selectedLangs, lang];
    }

    setSelectedLangs(updated);
    try {
      localStorage.setItem('steam_guesser_langs', JSON.stringify(updated));
    } catch (e) {}

    if (currentGame) {
      setIsLoadingReviews(true);
      setReviewError('');
      setClueIndex(0);
      setFailedAvatars({});
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
    if (gameMode === 'all') {
      pickNewGame(selectedLangs, 0, 'all');
    }
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

    const matchedGame = findBestMatchGame(guessText);

    if (!matchedGame) {
      setNotFoundError(`"${guessText}" was not found in the catalog. Please check your spelling or select a game from the suggestions.`);
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
      String(matchedGame.id) === String(currentGame.id) ||
      matchedGame.title.toLowerCase() === currentGame.title.toLowerCase();

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

      const maxC = Math.max(1, Math.min(10, gameReviews.length || 10));

      if (attemptCount >= maxC || clueIndex >= maxC - 1) {
        setGameStatus('lost');
        onScoreUpdate(0, false);
      } else {
        setAttemptCount(prev => prev + 1);
        setClueIndex(prev => prev + 1);
      }
    }
  };

  const handlePassClue = () => {
    const maxC = isLoadingReviews ? 10 : Math.max(1, Math.min(10, gameReviews.length || 10));
    if (gameStatus !== 'playing' || !currentGame || isLoadingReviews || attemptCount >= maxC || clueIndex >= maxC - 1) return;
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

  const maxClues = isLoadingReviews ? 10 : Math.max(1, Math.min(10, gameReviews.length || 10));
  const isLastClue = !isLoadingReviews && (attemptCount >= maxClues || clueIndex >= maxClues - 1);
  const nextPotentialPoints = calculatePoints(attemptCount);
  const revealedReviews = gameReviews.slice(0, clueIndex + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Aesthetic Game Mode Switcher */}
      <div className="mode-switcher-card">
        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab ${gameMode === 'all' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('all')}
          >
            <Globe size={18} />
            <span>All Games Catalog</span>
            <span className="mode-badge">{STEAM_GAMES_DATABASE.length} Games</span>
          </button>

          <button
            type="button"
            className={`mode-tab ${gameMode === 'steam_library' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('steam_library')}
          >
            <Library size={18} />
            <span>My Steam Library</span>
            {userLibraryInfo && userLibraryInfo.matchedCount > 0 && (
              <span className="mode-badge match">{userLibraryInfo.matchedCount} Matched</span>
            )}
          </button>
        </div>
      </div>

      {/* Steam Library Settings & Status Panel */}
      {gameMode === 'steam_library' && (
        <div className="library-status-card glass-card">
          {isEditingSteamId || !steamId ? (
            <div className="library-config-form">
              <div className="config-header">
                <Library size={22} className="config-icon" />
                <div>
                  <h3 className="config-title">Connect Your Steam Library</h3>
                  <p className="config-subtitle">
                    Enter your Steam ID64 or Custom Profile URL to play reviews exclusively from games in your library.
                  </p>
                </div>
              </div>

              {libraryError && (
                <div className="library-error-badge">
                  <AlertTriangle size={16} color="#ef4444" />
                  <span>{libraryError}</span>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loadLibrary(inputSteamId);
                }}
                className="config-inputs"
              >
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    className="input-steam"
                    placeholder="e.g. 76561198012345678 or custom vanity URL"
                    value={inputSteamId}
                    onChange={(e) => setInputSteamId(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isFetchingLibrary}
                >
                  {isFetchingLibrary ? <Loader2 size={16} className="spin-icon" /> : <CheckCircle2 size={16} />}
                  <span>{isFetchingLibrary ? 'Loading...' : 'Save & Sync Library'}</span>
                </button>
                {steamId && (
                  <button
                    type="button"
                    className="btn-steam"
                    onClick={() => setIsEditingSteamId(false)}
                  >
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                )}
              </form>
              <div className="config-footer-tip">
                💡 <strong>Privacy Note:</strong> Your Steam profile's <em>Game Details</em> privacy setting must be set to <strong>Public</strong>.
              </div>
            </div>
          ) : (
            <div className="library-profile-bar">
              <div className="profile-info-area">
                {userLibraryInfo?.avatar ? (
                  <img src={userLibraryInfo.avatar} alt={userLibraryInfo.personaName} className="user-steam-avatar" />
                ) : (
                  <div className="user-steam-avatar-placeholder">
                    <User size={20} />
                  </div>
                )}
                <div>
                  <div className="profile-name-row">
                    <span className="profile-persona-name">{userLibraryInfo?.personaName || steamId}</span>
                    <span className="synced-badge">
                      <CheckCircle2 size={13} /> {user ? 'Saved to Profile' : 'Cached Locally'}
                    </span>
                  </div>
                  <div className="profile-stats-row">
                    <span>Library Owned: <strong>{userLibraryInfo?.totalOwned || 0}</strong> games</span>
                    <span className="dot">•</span>
                    <span style={{ color: 'var(--steam-blue)' }}>Catalog Matched: <strong>{userLibraryGames.length}</strong> games</span>
                  </div>
                </div>
              </div>

              <div className="profile-actions">
                <button
                  type="button"
                  className="btn-steam btn-sm"
                  onClick={() => setIsEditingSteamId(true)}
                  title="Change Steam ID"
                >
                  <Edit3 size={14} />
                  <span>Change ID</span>
                </button>
                <button
                  type="button"
                  className="btn-steam btn-sm"
                  onClick={() => loadLibrary(steamId)}
                  disabled={isFetchingLibrary}
                  title="Resync Steam Library"
                >
                  <RefreshCw size={14} className={isFetchingLibrary ? 'spin-icon' : ''} />
                  <span>Resync</span>
                </button>
              </div>
            </div>
          )}

          {/* Warning if no matching games in library */}
          {!isEditingSteamId && userLibraryGames.length === 0 && !isFetchingLibrary && (
            <div className="library-empty-warning">
              <AlertTriangle size={20} color="#ffb703" />
              <div>
                <strong>No catalog games matched!</strong> None of the games in this Steam library match the current dataset of 100+ popular games.
                Try setting your profile privacy to Public, or switch to <strong>All Games Catalog</strong> mode.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Game Playing Card */}
      {gameMode === 'steam_library' && userLibraryGames.length === 0 && !isEditingSteamId ? (
        <div className="glass-card game-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Library size={48} color="var(--steam-text-muted)" style={{ margin: '0 auto 1rem auto', opacity: 0.6 }} />
          <h3 style={{ color: '#ffffff', fontSize: '1.25rem', marginBottom: '0.5rem' }}>Steam Library Pool Empty</h3>
          <p style={{ color: 'var(--steam-text-muted)', fontSize: '0.9rem', maxWidth: '460px', margin: '0 auto 1.5rem auto' }}>
            Please click "Change ID" above to enter your Steam profile ID or switch to All Games mode.
          </p>
          <button type="button" className="btn-primary" onClick={() => setIsEditingSteamId(true)} style={{ margin: '0 auto' }}>
            <Edit3 size={16} /> Enter Steam ID
          </button>
        </div>
      ) : !currentGame ? (
        <div className="glass-card game-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Loader2 size={32} color="var(--steam-blue)" className="spin-icon" style={{ margin: '0 auto 1rem auto' }} />
          <p style={{ color: 'var(--steam-text-muted)', fontSize: '0.9rem' }}>Loading game data...</p>
        </div>
      ) : (
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
              <Loader2 size={32} color="var(--steam-blue)" className="spin-icon" />
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
                className="btn-steam"
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
                    {rev.postedDate && (
                      <div className="steam-posted-date">Posted: {rev.postedDate}</div>
                    )}
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
                      onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
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
                    disabled={isLoadingReviews || isLastClue}
                    style={{
                      borderColor: isLastClue ? '#334155' : 'var(--steam-blue-dark)',
                      color: isLastClue ? '#64748b' : 'var(--steam-blue)',
                      opacity: isLastClue ? 0.4 : 1,
                      cursor: isLastClue ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <SkipForward size={15} />
                    <span>{isLastClue ? 'No More Clues' : 'Pass Clue'}</span>
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
                      <img src={game.coverImage} alt={game.title} onError={(e) => handleGameImageError(e, game.id)} style={{ width: '45px', height: '22px', objectFit: 'cover', borderRadius: '2px' }} />
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
                <img src={currentGame.coverImage} alt={currentGame.title} onError={(e) => handleGameImageError(e, currentGame.id)} style={{ width: '180px', height: '85px', objectFit: 'cover', borderRadius: '4px', boxShadow: '0 5px 20px rgba(0,0,0,0.6)' }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: gameStatus === 'won' ? '#4ade80' : '#ff6b81',
                    marginBottom: '0.25rem'
                  }}>
                    {gameStatus === 'won' ? '🎉 CONGRATULATIONS!' : (gameStatus === 'lost' ? '❌ OUT OF ATTEMPTS' : '🏳️ GAVE UP')}
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
                  {gameStatus === 'lost' ? 'You used all 10 attempts! The game was revealed above.' : 'Good luck on the next round!'}
                </p>
              )}

              <button className="btn-primary" onClick={() => pickNewGame(selectedLangs, 0, gameMode, userLibraryGames)} style={{ marginTop: '1rem', padding: '0.7rem 1.8rem', fontSize: '1rem' }}>
                <span>Next Game</span>
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
