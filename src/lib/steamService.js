// Steam API Service — Real reviews only, fast and clean.

/**
 * Tries to fetch Steam appreviews for a given appId and language.
 * Strategy: 1) Direct browser fetch (Steam allows CORS on this endpoint)
 *           2) allorigins proxy fallback
 *           3) corsproxy.io fallback
 */
async function fetchReviewsBatchForLang(appId, lang, cursor = '*') {
  const encodedCursor = encodeURIComponent(cursor);
  const url = `https://store.steampowered.com/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=recent&cursor=${encodedCursor}`;

  // 1. Direct fetch — Steam's appreviews endpoint supports CORS from browsers
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.reviews?.length > 0) {
        return { reviews: data.reviews, nextCursor: data.cursor || '*' };
      }
    }
  } catch (_) {}

  // 2. allorigins proxy
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(7000)
    });
    if (res.ok) {
      const json = await res.json();
      const data = typeof json.contents === 'string' ? JSON.parse(json.contents) : json.contents;
      if (data?.reviews?.length > 0) {
        return { reviews: data.reviews, nextCursor: data.cursor || '*' };
      }
    }
  } catch (_) {}

  // 3. corsproxy.io proxy
  try {
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(7000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.reviews?.length > 0) {
        return { reviews: data.reviews, nextCursor: data.cursor || '*' };
      }
    }
  } catch (_) {}

  return { reviews: [], nextCursor: '*' };
}

/**
 * Fetch real Steam avatars for a list of steamids.
 */
async function fetchAvatarsForSteamIds(steamIds) {
  const avatarMap = {};
  if (!steamIds?.length) return avatarMap;

  const fetchOne = async (steamid) => {
    try {
      const url = `https://steamcommunity.com/profiles/${steamid}?xml=1`;
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) return null;
      const json = await res.json();
      const match = json?.contents?.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const results = await Promise.allSettled(steamIds.slice(0, 10).map(id => fetchOne(id)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) avatarMap[steamIds[i]] = r.value;
  });

  return avatarMap;
}

/**
 * Parse a raw Steam review object into our app's review format.
 */
function parseReview(rev) {
  const rawText = rev.review?.trim() ?? '';
  if (!rawText) return null;
  const lineCount = rawText.split('\n').length;
  if (rawText.length < 10 || rawText.length > 400 || lineCount > 10) return null;

  const playtimeHours = Math.round((rev.author?.playtime_forever ?? 0) / 60);
  const steamId = rev.author?.steamid ?? null;
  const nickname = rev.author?.personaname || (steamId ? `User_${steamId.slice(-6)}` : 'Steam Player');

  return {
    id: rev.recommendationid,
    text: rawText,
    hours: playtimeHours,
    recommended: rev.voted_up !== false,
    votesUp: rev.votes_up ?? 0,
    author: nickname,
    steamId,
    avatar: null
  };
}

/**
 * Fetches up to 10 real Steam reviews for the given appId and language list.
 * Throws if no real reviews can be loaded.
 */
export async function fetchLiveSteamReviews(appId, languages = ['english', 'turkish']) {
  const langs = languages?.length ? languages : ['english', 'turkish'];
  const seenIds = new Set();
  const reviews = [];

  // Fetch one page per language simultaneously
  const batches = await Promise.allSettled(
    langs.map(lang => fetchReviewsBatchForLang(appId, lang, '*'))
  );

  // Interleave results across languages (en-tr-en-tr...)
  const perLang = batches
    .filter(r => r.status === 'fulfilled' && r.value.reviews.length > 0)
    .map(r => r.value.reviews);

  if (perLang.length > 0) {
    const maxLen = Math.max(...perLang.map(b => b.length));
    outer: for (let i = 0; i < maxLen; i++) {
      for (const batch of perLang) {
        const rev = batch[i];
        if (!rev || seenIds.has(rev.recommendationid)) continue;
        const parsed = parseReview(rev);
        if (!parsed) continue;
        seenIds.add(rev.recommendationid);
        reviews.push(parsed);
        if (reviews.length >= 10) break outer;
      }
    }
  }

  // If selected languages got 0 results (e.g. no TR reviews), fall back to English only
  if (reviews.length === 0 && langs.length > 1) {
    const { reviews: enRevs } = await fetchReviewsBatchForLang(appId, 'english', '*');
    for (const rev of enRevs) {
      if (seenIds.has(rev.recommendationid)) continue;
      const parsed = parseReview(rev);
      if (!parsed) continue;
      seenIds.add(rev.recommendationid);
      reviews.push(parsed);
      if (reviews.length >= 10) break;
    }
  }

  if (reviews.length === 0) {
    throw new Error(`Bu oyun için canlı Steam yorumu çekilemedi (AppID: ${appId}).`);
  }

  // Enrich avatars
  const steamIds = reviews.map(r => r.steamId).filter(Boolean);
  if (steamIds.length > 0) {
    const avatarMap = await fetchAvatarsForSteamIds(steamIds);
    reviews.forEach(rev => {
      if (rev.steamId && avatarMap[rev.steamId]) rev.avatar = avatarMap[rev.steamId];
    });
  }

  return reviews;
}
