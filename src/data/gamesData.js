import rawGamesList from './steamGamesList.json';

// Deduplicate raw games list by unique id
const uniqueGamesMap = new Map();
rawGamesList.forEach(game => {
  const strId = String(game.id);
  if (!uniqueGamesMap.has(strId)) {
    uniqueGamesMap.set(strId, {
      id: strId,
      title: game.title,
      coverImage: game.coverImage || `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/header.jpg`
    });
  }
});

export const STEAM_GAMES_DATABASE = Array.from(uniqueGamesMap.values());

// Helper: Normalize string (lowercase, remove diacritics & non-alphanumeric punctuation)
export function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper: Compact string (remove all spaces for combined word matching like "eldenring")
export function compactString(str) {
  return normalizeString(str).replace(/\s+/g, '');
}

// Helper: Calculate Levenshtein distance between two strings
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Check if fuzzy distance is within acceptable typo tolerance (1-3 typos based on length)
function getMaxAllowedTypos(length) {
  if (length <= 4) return 1;
  if (length <= 8) return 2;
  return 3;
}

// Calculate match score for a game title against a user query
function getFuzzyMatchScore(query, title) {
  const normQ = normalizeString(query);
  const compQ = compactString(query);
  const normTitle = normalizeString(title);
  const compTitle = compactString(title);

  if (!normQ || !normTitle) return 0;

  // 1. Exact matches
  if (normTitle === normQ || compTitle === compQ) return 1000;

  // 2. Title starts with query
  if (normTitle.startsWith(normQ) || compTitle.startsWith(compQ)) {
    return 900 - Math.abs(compTitle.length - compQ.length);
  }

  // 3. Title contains query as substring
  if (normTitle.includes(normQ) || compTitle.includes(compQ)) {
    return 750 - Math.abs(compTitle.length - compQ.length);
  }

  // 4. Query contains title as substring
  if (normQ.includes(normTitle) || compQ.includes(compTitle)) {
    return 700 - Math.abs(compQ.length - compTitle.length);
  }

  // 5. Word-by-word matching
  const qWords = normQ.split(' ');
  const titleWords = normTitle.split(' ');

  let wordMatches = 0;
  for (const qWord of qWords) {
    if (qWord.length < 2) continue;
    if (titleWords.some(tWord => tWord.includes(qWord) || qWord.includes(tWord))) {
      wordMatches++;
    }
  }
  if (wordMatches > 0 && wordMatches === qWords.length) {
    return 600 + wordMatches * 20;
  }

  // 6. Fuzzy edit distance matching (typo tolerance)
  const maxTypos = getMaxAllowedTypos(compQ.length);

  // Full string fuzzy distance
  const fullDist = levenshteinDistance(compQ, compTitle);
  if (fullDist <= maxTypos) {
    return 500 - fullDist * 50;
  }

  // Substring sliding window fuzzy distance on compact title
  if (compTitle.length > compQ.length) {
    const windowSize = compQ.length;
    let minWindowDist = Infinity;

    for (let i = 0; i <= compTitle.length - windowSize; i++) {
      const windowStr = compTitle.slice(i, i + windowSize);
      const dist = levenshteinDistance(compQ, windowStr);
      if (dist < minWindowDist) minWindowDist = dist;
    }

    if (minWindowDist <= maxTypos) {
      return 400 - minWindowDist * 40;
    }
  }

  // Individual word fuzzy distance (e.g. "cyberponk" -> "cyberpunk")
  if (compQ.length >= 4) {
    for (const tWord of titleWords) {
      if (tWord.length < 3) continue;
      const wordDist = levenshteinDistance(normQ, tWord);
      const wordMaxTypos = getMaxAllowedTypos(tWord.length);
      if (wordDist <= wordMaxTypos) {
        return 350 - wordDist * 30;
      }
    }
  }

  return 0;
}

// Fuzzy autocomplete search (Max `limit` results sorted by relevance)
export function searchGames(query, limit = 5) {
  if (!query || !query.trim()) return [];

  const scoredResults = [];

  for (const game of STEAM_GAMES_DATABASE) {
    const score = getFuzzyMatchScore(query, game.title);
    if (score > 0) {
      scoredResults.push({ game, score });
    }
  }

  scoredResults.sort((a, b) => b.score - a.score);

  return scoredResults.slice(0, limit).map(item => item.game);
}

// Find the single best matching game for user's submitted guess
export function findBestMatchGame(guessQuery) {
  if (!guessQuery || !guessQuery.trim()) return null;

  let bestGame = null;
  let maxScore = 0;

  for (const game of STEAM_GAMES_DATABASE) {
    const score = getFuzzyMatchScore(guessQuery, game.title);
    if (score > maxScore) {
      maxScore = score;
      bestGame = game;
    }
  }

  if (maxScore >= 300) {
    return bestGame;
  }

  return null;
}
