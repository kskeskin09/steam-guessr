// Steam API Service for Live Reviews (100% Real Steam Reviews)

const CORS_PROXIES = [
  // 1. Direct AllOrigins GET wrapper
  async (url) => {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.contents) return null;
    return typeof json.contents === 'string' ? JSON.parse(json.contents) : json.contents;
  },
  // 2. CorsProxy.io
  async (url) => {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  },
  // 3. CodeTabs Proxy
  async (url) => {
    const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  },
  // 4. CorsProxy.org
  async (url) => {
    const res = await fetch(`https://corsproxy.org/?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  }
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
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(profileUrl)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const json = await res.json();
      const text = json.contents;
      if (!text) return null;
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
 * Fetch a batch of raw reviews for a specific language & cursor from Steam API
 */
async function fetchReviewsBatchForLang(appId, lang, cursor = '*') {
  const encodedCursor = encodeURIComponent(cursor);
  const cacheBuster = `_cb=${Date.now()}`;
  const filterTypes = ['all', 'summary', 'recent'];

  for (const filterType of filterTypes) {
    const targetUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=${filterType}&cursor=${encodedCursor}&${cacheBuster}`;
    const localProxyUrl = `/api/steam/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=${filterType}&cursor=${encodedCursor}&${cacheBuster}`;

    // A. DIRECT FETCH (User's browser IP - Steam supports CORS headers directly on store.steampowered.com/appreviews)
    try {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.reviews && Array.isArray(data.reviews) && data.reviews.length > 0) {
          return { reviews: data.reviews, nextCursor: data.cursor || '*' };
        }
      }
    } catch (err) {}

    // B. Local Vite Proxy (for localhost development)
    try {
      const res = await fetch(localProxyUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.reviews && Array.isArray(data.reviews) && data.reviews.length > 0) {
          return { reviews: data.reviews, nextCursor: data.cursor || '*' };
        }
      }
    } catch (err) {}

    // C. CORS Proxies
    for (const proxyFn of CORS_PROXIES) {
      try {
        const data = await proxyFn(targetUrl);
        if (data && data.reviews && Array.isArray(data.reviews) && data.reviews.length > 0) {
          return { reviews: data.reviews, nextCursor: data.cursor || '*' };
        }
      } catch (err) {}
    }
  }

  return { reviews: [], nextCursor: '*' };
}

/**
 * Helper to fetch valid reviews for specified languages
 */
async function fetchReviewsForLangs(appId, selectedLangs) {
  const validReviews = [];
  const seenIds = new Set();
  
  const cursors = {};
  selectedLangs.forEach(lang => {
    cursors[lang] = '*';
  });

  const MAX_PAGES = 3;

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

    if (langBatches.length === 0) break;

    const maxLen = Math.max(...langBatches.map(b => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const batch of langBatches) {
        const rev = batch[i];
        if (!rev || !rev.recommendationid || seenIds.has(rev.recommendationid)) continue;

        const rawText = rev.review ? rev.review.trim() : '';
        if (!rawText) continue;

        const lineCount = rawText.split('\n').length;
        if (rawText.length < 10 || rawText.length > 400 || lineCount > 10) continue;

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

  return validReviews;
}

/**
 * Fetches live reviews directly from Steam AppReviews API.
 * NO FAKE DATA: Strictly 100% real Steam reviews.
 */
export async function fetchLiveSteamReviews(appId, languages = ['english', 'turkish']) {
  let selectedLangs = (languages && languages.length > 0) ? languages : ['english', 'turkish'];
  
  // 1. Try requested languages
  let validReviews = await fetchReviewsForLangs(appId, selectedLangs);

  // 2. If 0 reviews found (e.g. game has 0 Turkish reviews), try English live Steam reviews
  if (validReviews.length === 0 && !selectedLangs.includes('english')) {
    validReviews = await fetchReviewsForLangs(appId, ['english']);
  }

  // 3. If still 0 reviews, try all languages on Steam
  if (validReviews.length === 0) {
    validReviews = await fetchReviewsForLangs(appId, ['all']);
  }

  // Strictly no fake data: if 0 valid real Steam reviews were fetched, throw error
  if (validReviews.length === 0) {
    throw new Error(`Steam sunucularından bu oyun için canlı yorum çekilemedi (AppID: ${appId}).`);
  }

  const target10 = validReviews.slice(0, 10);

  // Enrich real avatars for steamIds
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
