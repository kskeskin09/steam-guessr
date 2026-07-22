// Steam API Service — Real reviews only.

const STEAM_BASE = 'https://store.steampowered.com/appreviews';

function buildSteamUrl(appId, lang) {
  return `${STEAM_BASE}/${appId}?json=1&language=${lang}&num_per_page=20&filter=recent&review_type=all&purchase_type=all`;
}

async function tryFetch(url, timeout = 6000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchSteamData(steamUrl) {
  const enc = encodeURIComponent(steamUrl);

  const strategies = [
    // 1. Direct browser fetch (works if Steam allows CORS)
    () => tryFetch(steamUrl, 5000),

    // 2. allorigins /raw — returns raw JSON body
    () => tryFetch(`https://api.allorigins.win/raw?url=${enc}`, 7000),

    // 3. allorigins /get — returns JSON wrapper
    () => tryFetch(`https://api.allorigins.win/get?url=${enc}`, 7000).then(j => {
      const c = typeof j.contents === 'string' ? JSON.parse(j.contents) : j.contents;
      if (!c?.reviews) throw new Error('no reviews in wrapper');
      return c;
    }),

    // 4. corsproxy.io
    () => tryFetch(`https://corsproxy.io/?${enc}`, 7000),

    // 5. codetabs
    () => tryFetch(`https://api.codetabs.com/v1/proxy?quest=${enc}`, 7000),
  ];

  // Run all in parallel — return first that gives us actual reviews
  const data = await Promise.any(
    strategies.map(fn =>
      fn().then(d => {
        if (!d?.reviews?.length) throw new Error('empty');
        return d;
      })
    )
  );
  return data;
}

function parseReview(rev) {
  const text = rev.review?.trim() ?? '';
  if (!text || text.length < 10 || text.length > 400) return null;
  if (text.split('\n').length > 10) return null;

  return {
    id: rev.recommendationid,
    text,
    hours: Math.round((rev.author?.playtime_forever ?? 0) / 60),
    recommended: rev.voted_up !== false,
    votesUp: rev.votes_up ?? 0,
    author: rev.author?.personaname || (rev.author?.steamid ? `User_${rev.author.steamid.slice(-6)}` : 'Steam Player'),
    steamId: rev.author?.steamid ?? null,
    avatar: null,
  };
}

async function fetchAvatarsForSteamIds(steamIds) {
  const avatarMap = {};
  if (!steamIds?.length) return avatarMap;

  const fetchOne = async (steamid) => {
    try {
      const url = `https://steamcommunity.com/profiles/${steamid}?xml=1`;
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const match = json?.contents?.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const results = await Promise.allSettled(steamIds.slice(0, 10).map(fetchOne));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) avatarMap[steamIds[i]] = r.value;
  });
  return avatarMap;
}

export async function fetchLiveSteamReviews(appId, languages = ['english', 'turkish']) {
  const langs = languages?.length ? languages : ['english', 'turkish'];
  const seenIds = new Set();
  const reviews = [];

  // Fetch all selected languages in parallel
  const results = await Promise.allSettled(
    langs.map(lang => fetchSteamData(buildSteamUrl(appId, lang)))
  );

  // Interleave results (en, tr, en, tr...)
  const batches = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value.reviews);

  if (batches.length > 0) {
    const maxLen = Math.max(...batches.map(b => b.length));
    outer: for (let i = 0; i < maxLen; i++) {
      for (const batch of batches) {
        if (reviews.length >= 10) break outer;
        const rev = batch[i];
        if (!rev || seenIds.has(rev.recommendationid)) continue;
        const parsed = parseReview(rev);
        if (!parsed) continue;
        seenIds.add(rev.recommendationid);
        reviews.push(parsed);
      }
    }
  }

  // If selected langs returned nothing, fall back to English
  if (reviews.length === 0 && !langs.includes('english')) {
    try {
      const data = await fetchSteamData(buildSteamUrl(appId, 'english'));
      for (const rev of data.reviews) {
        if (reviews.length >= 10) break;
        if (seenIds.has(rev.recommendationid)) continue;
        const parsed = parseReview(rev);
        if (!parsed) continue;
        seenIds.add(rev.recommendationid);
        reviews.push(parsed);
      }
    } catch {}
  }

  if (reviews.length === 0) {
    throw new Error(`Could not load live Steam reviews for this game (AppID: ${appId}).`);
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
