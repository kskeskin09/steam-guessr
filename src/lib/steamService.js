// Steam API Service for Live Reviews (Strictly 100% Real Steam Reviews - No Fake/Fallback Reviews)

const CORS_PROXIES = [
  // 1. AllOrigins GET wrapper
  async (url) => {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.contents) return null;
    return typeof json.contents === 'string' ? JSON.parse(json.contents) : json.contents;
  },
  // 2. CodeTabs Proxy
  async (url) => {
    const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json();
  },
  // 3. CorsProxy.org
  async (url) => {
    const res = await fetch(`https://corsproxy.org/?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json();
  },
  // 4. ThingProxy
  async (url) => {
    const res = await fetch(`https://thingproxy.freeboard.io/fetch/${url}`, { signal: AbortSignal.timeout(6000) });
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
  const targetUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=all&cursor=${encodedCursor}`;
  const localProxyUrl = `/api/steam/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=all&cursor=${encodedCursor}`;

  // 1. Try Vite proxy if in local dev
  try {
    const res = await fetch(localProxyUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.reviews && data.reviews.length > 0) {
        return { reviews: data.reviews, nextCursor: data.cursor || '*' };
      }
    }
  } catch (err) {}

  // 2. Try CORS proxies
  for (const proxyFn of CORS_PROXIES) {
    try {
      const data = await proxyFn(targetUrl);
      if (data && data.reviews && Array.isArray(data.reviews) && data.reviews.length > 0) {
        return { reviews: data.reviews, nextCursor: data.cursor || '*' };
      }
    } catch (err) {}
  }

  return { reviews: [], nextCursor: '*' };
}

/**
 * Fetches live reviews directly from Steam AppReviews API.
 * NO FAKE REVIEWS: Throws an error if real Steam reviews cannot be loaded.
 */
export async function fetchLiveSteamReviews(appId, languages = ['english', 'turkish']) {
  const selectedLangs = (languages && languages.length > 0) ? languages : ['english', 'turkish'];
  
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

    if (langBatches.length === 0) {
      break;
    }

    const maxLen = Math.max(...langBatches.map(b => b.length));
    for (let i = 0; i < maxLen; i++) {
      for (const batch of langBatches) {
        const rev = batch[i];
        if (!rev || !rev.recommendationid || seenIds.has(rev.recommendationid)) continue;

        const rawText = rev.review ? rev.review.trim() : '';
        if (!rawText) continue;

        const lineCount = rawText.split('\n').length;
        if (rawText.length < 10 || rawText.length > 400 || lineCount > 10) {
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

  // Strictly no fake data: if 0 valid real Steam reviews were fetched, throw error
  if (validReviews.length === 0) {
    throw new Error(`Steam yorumları bu oyun için çekilemedi (AppID: ${appId}). Ağ veya bağlantı engeli olabilir.`);
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
