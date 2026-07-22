// Steam API Service for Live Reviews

const CORS_PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

/**
 * Fetch player summaries (including avatars) for a list of steamids.
 */
async function fetchAvatarsForSteamIds(steamIds) {
  const avatarMap = {};
  if (!steamIds || steamIds.length === 0) return avatarMap;

  const fetchAvatar = async (steamid) => {
    try {
      const profileUrl = `https://steamcommunity.com/profiles/${steamid}?xml=1`;
      const proxied = `https://corsproxy.io/?${encodeURIComponent(profileUrl)}`;
      const res = await fetch(proxied, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const text = await res.text();
      const match = text.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const results = await Promise.allSettled(steamIds.slice(0, 10).map(id => fetchAvatar(id)));
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled' && result.value) {
      avatarMap[steamIds[idx]] = result.value;
    }
  });

  return avatarMap;
}

/**
 * Fetch a batch of 100 raw reviews for a specific language & cursor from Steam API
 */
async function fetchReviewsBatchForLang(appId, lang, cursor = '*') {
  const cacheBuster = `_cb=${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const encodedCursor = encodeURIComponent(cursor);
  const targetUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=summary&cursor=${encodedCursor}&${cacheBuster}`;
  const localProxyUrl = `/api/steam/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=summary&cursor=${encodedCursor}&${cacheBuster}`;

  // 1. Try Vite proxy
  try {
    const res = await fetch(localProxyUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.reviews) {
        return { reviews: data.reviews, nextCursor: data.cursor || '*' };
      }
    }
  } catch (err) {}

  // 2. Try CORS proxies
  for (const proxyFn of CORS_PROXIES) {
    try {
      const proxyUrl = proxyFn(targetUrl);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.reviews) {
          return { reviews: data.reviews, nextCursor: data.cursor || '*' };
        }
      }
    } catch (err) {}
  }

  return { reviews: [], nextCursor: '*' };
}

/**
 * Fetches live reviews directly from Steam AppReviews API ONLY for selected languages.
 * - Raw review text is preserved as-is (no text cleaning or truncation).
 * - Exceeding boundary limits (length 10..400, lineCount <= 10) are completely discarded.
 * - Iteratively fetches batches of 100 via cursor pagination until at least 10 valid real reviews are collected.
 */
export async function fetchLiveSteamReviews(appId, languages = ['english', 'turkish']) {
  const selectedLangs = (languages && languages.length > 0) ? languages : ['english', 'turkish'];
  
  const validReviews = [];
  const seenIds = new Set();
  
  const cursors = {};
  selectedLangs.forEach(lang => {
    cursors[lang] = '*';
  });

  const MAX_PAGES = 5; // Up to 5 batches per language to try collecting 10 valid real reviews

  for (let page = 0; page < MAX_PAGES; page++) {
    if (validReviews.length >= 10) break;

    const results = await Promise.allSettled(
      selectedLangs.map(lang => fetchReviewsBatchForLang(appId, lang, cursors[lang]))
    );

    const langBatches = [];
    results.forEach((res, idx) => {
      const lang = selectedLangs[idx];
      if (res.status === 'fulfilled' && res.value) {
        const { reviews, nextCursor } = res.value;
        if (nextCursor) cursors[lang] = nextCursor;
        if (reviews && reviews.length > 0) {
          langBatches.push(reviews);
        }
      }
    });

    if (langBatches.length === 0) {
      break;
    }

    const maxLen = Math.max(...langBatches.map(b => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const batch of langBatches) {
        const rev = batch[i];
        if (!rev || !rev.recommendationid || seenIds.has(rev.recommendationid)) continue;

        // Raw text: preserved as returned by Steam (no stripping, no truncation)
        const rawText = rev.review ? rev.review.trim() : '';
        if (!rawText) continue;

        // Strict limit check: text length 10..400, line count <= 10
        const lineCount = rawText.split('\n').length;
        if (rawText.length < 10 || rawText.length > 400 || lineCount > 10) {
          // Discard completely if limits are exceeded
          continue;
        }

        seenIds.add(rev.recommendationid);

        const playtimeHours = Math.round((rev.author?.playtime_forever || 0) / 60);
        const steamId = rev.author?.steamid || null;
        const nickname = rev.author?.personaname || (steamId ? `User_${steamId.slice(-6)}` : 'Steam Player');

        validReviews.push({
          id: rev.recommendationid,
          text: rawText,
          hours: playtimeHours,
          recommended: rev.voted_up !== false,
          votesUp: rev.votes_up || 0,
          author: nickname,
          steamId: steamId,
          avatar: null
        });

        if (validReviews.length >= 10) break;
      }
      if (validReviews.length >= 10) break;
    }
  }

  if (validReviews.length === 0) {
    throw new Error(`No live Steam reviews matching criteria found for AppID ${appId}`);
  }

  const target10 = validReviews.slice(0, 10);

  // Fetch real avatars for steamIds
  const steamIds = target10.map(r => r.steamId).filter(Boolean);
  if (steamIds.length > 0) {
    const avatarMap = await fetchAvatarsForSteamIds(steamIds);
    target10.forEach(rev => {
      if (rev.steamId && avatarMap[rev.steamId]) {
        rev.avatar = avatarMap[rev.steamId];
      }
    });
  }

  return target10;
}
