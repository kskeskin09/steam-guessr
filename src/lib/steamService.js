// Steam API Service for Live Reviews with Robust CORS Fallbacks & Strict Language Filtering

const CORS_PROXIES = [
  // 1. AllOrigins GET wrapper (handles JSON formatting & server headers properly)
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

const ENGLISH_FALLBACK_REVIEWS = [
  { text: "Best game I've played this year. The soundtrack alone is worth it!", hours: 142, recommended: true, votesUp: 54, author: "GamerPro99" },
  { text: "Graphics are amazing but the tutorial could be better. Overall 8/10.", hours: 67, recommended: true, votesUp: 12, author: "ShadowHunter" },
  { text: "Spent 200 hours in this game and I still find new things every day.", hours: 215, recommended: true, votesUp: 104, author: "PixelKnight" },
  { text: "Optimization is poor on mid-range PCs. Wait for a sale.", hours: 18, recommended: false, votesUp: 29, author: "TechReviewer" },
  { text: "Too many microtransactions, but the core gameplay loop is addictive.", hours: 94, recommended: true, votesUp: 7, author: "Vortex_9" },
  { text: "Masterpiece. 10/10.", hours: 310, recommended: true, votesUp: 88, author: "SteamLegend" },
  { text: "Controls take some time to get used to, but after that it's smooth sailing.", hours: 53, recommended: true, votesUp: 15, author: "NeonRider" },
  { text: "The storyline and character development blew me away.", hours: 120, recommended: true, votesUp: 45, author: "StoryBuff" },
  { text: "Fun with friends, but pretty boring if you play solo.", hours: 78, recommended: true, votesUp: 31, author: "CoopGamer" },
  { text: "Bugs everywhere. Wait for patches before buying.", hours: 12, recommended: false, votesUp: 62, author: "BugHunter" }
];

const TURKISH_FALLBACK_REVIEWS = [
  { text: "Bunu indirimde almıştım, kesinlikle parasını hak ediyor. Arkadaşlarla oynamak çok zevkli.", hours: 89, recommended: true, votesUp: 38, author: "OyuncuTR" },
  { text: "Hikayesi ve atmosferi harika. Şiddetle tavsiye ederim.", hours: 45, recommended: true, votesUp: 19, author: "EfsaneKullanici" },
  { text: "Arkadaş grubuyla girdiğimizde saatlerin nasıl geçtiğini anlamıyoruz.", hours: 112, recommended: true, votesUp: 42, author: "KralOyuncu" },
  { text: "Grafikler harika fakat optimizasyon biraz sıkıntılı. Güncelleme bekleyin.", hours: 34, recommended: false, votesUp: 25, author: "Donanimci" },
  { text: "Türkçe dil desteği olması harika bir detay. Emeği geçenlere teşekkürler.", hours: 150, recommended: true, votesUp: 95, author: "TurkGamer" },
  { text: "Yıllardır oynuyorum, mekanikleri hala ilk günkü gibi sarıyor.", hours: 280, recommended: true, votesUp: 110, author: "UstaOyuncu" },
  { text: "Fiyatı biraz pahalı gelebilir ama verdiğiniz her kuruşa değiyor.", hours: 64, recommended: true, votesUp: 28, author: "EkonomistGamer" },
  { text: "Müzikler efsane, atmosfer insanı içine çekiyor. 9/10.", hours: 73, recommended: true, votesUp: 50, author: "MelodiGurusu" },
  { text: "Tek başınıza girerseniz bir süre sonra sıkabilir ama ekiple tadından yenmez.", hours: 91, recommended: true, votesUp: 33, author: "TakimKaptani" },
  { text: "Son güncellemeyle oyunu bozmuşlar, eski hali çok daha iyiydi.", hours: 210, recommended: false, votesUp: 76, author: "EskiToprak" }
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
 * Fetch a batch of 100 raw reviews for a specific language & cursor from Steam API
 */
async function fetchReviewsBatchForLang(appId, lang, cursor = '*') {
  const cacheBuster = `_cb=${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const encodedCursor = encodeURIComponent(cursor);
  const targetUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=summary&cursor=${encodedCursor}&${cacheBuster}`;
  const localProxyUrl = `/api/steam/appreviews/${appId}?json=1&language=${lang}&review_type=all&purchase_type=all&num_per_page=100&filter=summary&cursor=${encodedCursor}&${cacheBuster}`;

  // 1. Try Vite proxy if in local dev
  try {
    const res = await fetch(localProxyUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.reviews) {
        return { reviews: data.reviews, nextCursor: data.cursor || '*' };
      }
    }
  } catch (err) {}

  // 2. Try robust CORS proxies
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
 * Fetches live reviews directly from Steam AppReviews API strictly adhering to chosen languages.
 */
export async function fetchLiveSteamReviews(appId, languages = ['english', 'turkish']) {
  const selectedLangs = (languages && languages.length > 0) ? languages : ['english', 'turkish'];
  
  const validReviews = [];
  const seenIds = new Set();
  
  const cursors = {};
  selectedLangs.forEach(lang => {
    cursors[lang] = '*';
  });

  const MAX_PAGES = 4;

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

  // If live fetch returned fewer than 10 valid reviews, complement with language-specific fallbacks
  if (validReviews.length < 10) {
    const fallbacks = generateFallbackReviews(appId, selectedLangs);
    for (const f of fallbacks) {
      if (validReviews.length >= 10) break;
      if (!seenIds.has(f.id)) {
        seenIds.add(f.id);
        validReviews.push(f);
      }
    }
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

/**
 * Generates realistic fallback Steam reviews strictly matching the selected languages.
 */
function generateFallbackReviews(appId, languages = ['english', 'turkish']) {
  const isEn = languages.includes('english');
  const isTr = languages.includes('turkish');

  let pool = [];
  if (isEn && isTr) {
    const maxLen = Math.max(ENGLISH_FALLBACK_REVIEWS.length, TURKISH_FALLBACK_REVIEWS.length);
    for (let i = 0; i < maxLen; i++) {
      if (TURKISH_FALLBACK_REVIEWS[i]) pool.push(TURKISH_FALLBACK_REVIEWS[i]);
      if (ENGLISH_FALLBACK_REVIEWS[i]) pool.push(ENGLISH_FALLBACK_REVIEWS[i]);
    }
  } else if (isTr) {
    pool = [...TURKISH_FALLBACK_REVIEWS];
  } else {
    pool = [...ENGLISH_FALLBACK_REVIEWS];
  }

  return pool.slice(0, 10).map((rev, index) => ({
    id: `fallback_${appId}_${index}`,
    text: rev.text,
    hours: rev.hours,
    recommended: rev.recommended,
    votesUp: rev.votesUp,
    author: rev.author,
    steamId: null,
    avatar: null
  }));
}
