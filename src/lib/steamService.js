// Steam API Service — Fetches real Steam reviews via Supabase Edge Function proxy.

const SUPABASE_URL = "https://wgsjygplvgukrqmfcjtf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnc2p5Z3Bsdmd1a3JxbWZjanRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjcxNjIsImV4cCI6MjEwMDMwMzE2Mn0.KBuQDPmrVozT7GJnPJJnxJnREqhSGmO3gFGmpd6l68Y";

async function fetchReviewsForLang(appId, lang) {
  // 1. Primary: Supabase Edge Function (server-side, bypasses CORS/Cloudflare)
  try {
    const fnUrl = `${SUPABASE_URL}/functions/v1/steam-reviews?appid=${appId}&lang=${lang}`;
    const res = await fetch(fnUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.reviews?.length > 0) return data.reviews;
    }
  } catch (_) {}

  // 2. Fallback: Local Vite dev proxy (works during npm run dev)
  try {
    const localUrl = `/api/steam/appreviews/${appId}?json=1&language=${lang}&num_per_page=20&filter=recent&review_type=all&purchase_type=all`;
    const res = await fetch(localUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data?.reviews?.length > 0) return data.reviews;
    }
  } catch (_) {}

  // 3. Last resort: allorigins proxy
  try {
    const steamUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=${lang}&num_per_page=20&filter=recent&review_type=all&purchase_type=all`;
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(steamUrl)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = await res.json();
      const data = typeof json.contents === "string" ? JSON.parse(json.contents) : json.contents;
      if (data?.reviews?.length > 0) return data.reviews;
    }
  } catch (_) {}

  return [];
}

function parseReview(rev) {
  const text = rev.review?.trim() ?? "";
  if (!text || text.length < 10 || text.length > 400) return null;
  if (text.split("\n").length > 10) return null;
  return {
    id: rev.recommendationid,
    text,
    hours: Math.round((rev.author?.playtime_forever ?? 0) / 60),
    recommended: rev.voted_up !== false,
    votesUp: rev.votes_up ?? 0,
    author: rev.author?.personaname || (rev.author?.steamid ? `User_${rev.author.steamid.slice(-6)}` : "Steam Player"),
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
    if (r.status === "fulfilled" && r.value) avatarMap[steamIds[i]] = r.value;
  });
  return avatarMap;
}

export async function fetchLiveSteamReviews(appId, languages = ["english", "turkish"]) {
  const langs = languages?.length ? languages : ["english", "turkish"];
  const seenIds = new Set();
  const reviews = [];

  // Fetch all languages in parallel
  const rawBatches = await Promise.all(langs.map((lang) => fetchReviewsForLang(appId, lang)));

  // Interleave: en, tr, en, tr...
  const batches = rawBatches.filter((b) => b.length > 0);

  if (batches.length > 0) {
    const maxLen = Math.max(...batches.map((b) => b.length));
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

  // If selected langs returned nothing and English wasn't already tried, try English
  if (reviews.length === 0 && !langs.includes("english")) {
    const enBatch = await fetchReviewsForLang(appId, "english");
    for (const rev of enBatch) {
      if (reviews.length >= 10) break;
      if (seenIds.has(rev.recommendationid)) continue;
      const parsed = parseReview(rev);
      if (!parsed) continue;
      seenIds.add(rev.recommendationid);
      reviews.push(parsed);
    }
  }

  if (reviews.length === 0) {
    throw new Error(`Could not load live Steam reviews for this game (AppID: ${appId}).`);
  }

  // Enrich avatars
  const steamIds = reviews.map((r) => r.steamId).filter(Boolean);
  if (steamIds.length > 0) {
    const avatarMap = await fetchAvatarsForSteamIds(steamIds);
    reviews.forEach((rev) => {
      if (rev.steamId && avatarMap[rev.steamId]) rev.avatar = avatarMap[rev.steamId];
    });
  }

  return reviews;
}

export async function fetchSteamUserLibrary(steamIdInput) {
  if (!steamIdInput || !steamIdInput.trim()) {
    return { success: false, error: "Please enter a valid Steam ID or Profile URL." };
  }

  const raw = steamIdInput.trim();

  // 1. Extract 17-digit numeric SteamID64 (e.g. 76561199244035935) from any URL format
  const numericMatch = raw.match(/7656119\d{10}/);
  let cleanedId = '';
  let isNumeric = false;

  if (numericMatch) {
    cleanedId = numericMatch[0];
    isNumeric = true;
  } else {
    // 2. Check for vanity URL segment e.g. steamcommunity.com/id/USERNAME/...
    const vanityMatch = raw.match(/steamcommunity\.com\/id\/([^\/\?#]+)/i);
    if (vanityMatch) {
      cleanedId = vanityMatch[1];
      isNumeric = false;
    } else {
      // 3. Strip any remaining URL prefixes or subpaths
      cleanedId = raw.replace(/^(https?:\/\/)?(www\.)?steamcommunity\.com\/(id|profiles)\//i, '');
      cleanedId = cleanedId.split('/')[0].split('?')[0].split('#')[0].trim();
      isNumeric = /^\d{17}$/.test(cleanedId);
    }
  }

  if (!cleanedId) {
    return { success: false, error: "Could not extract a valid Steam ID or Custom URL from your input." };
  }

  const relativePath = isNumeric
    ? `profiles/${cleanedId}?xml=1`
    : `id/${cleanedId}?xml=1`;

  const fullTargetUrl = `https://steamcommunity.com/${relativePath}`;
  const localProxyUrl = `/api/steamcommunity/${relativePath}`;

  // Concurrent fetch strategies (Vite dev proxy, Direct fetch, and multiple CORS proxies)
  const fetchStrategies = [
    // 1. Vite dev proxy (fastest during npm run dev)
    async () => {
      const res = await fetch(localProxyUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error("Local proxy failed");
      const text = await res.text();
      if (!text || (!text.includes("<profile>") && !text.includes("<error>"))) throw new Error("Invalid local proxy content");
      return text;
    },
    // 2. Direct fetch
    async () => {
      const res = await fetch(fullTargetUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error("Direct fetch failed");
      const text = await res.text();
      if (!text || (!text.includes("<profile>") && !text.includes("<error>"))) throw new Error("Invalid direct fetch content");
      return text;
    },
    // 3. allorigins.win API
    async () => {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(fullTargetUrl)}`, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error("allorigins failed");
      const json = await res.json();
      const text = json?.contents;
      if (!text || (!text.includes("<profile>") && !text.includes("<error>"))) throw new Error("Invalid allorigins content");
      return text;
    },
    // 4. codetabs.com proxy
    async () => {
      const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(fullTargetUrl)}`, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error("codetabs failed");
      const text = await res.text();
      if (!text || (!text.includes("<profile>") && !text.includes("<error>"))) throw new Error("Invalid codetabs content");
      return text;
    },
    // 5. corsproxy.io
    async () => {
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(fullTargetUrl)}`, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error("corsproxy failed");
      const text = await res.text();
      if (!text || (!text.includes("<profile>") && !text.includes("<error>"))) throw new Error("Invalid corsproxy content");
      return text;
    }
  ];

  let xmlContent = null;
  try {
    xmlContent = await Promise.any(fetchStrategies.map(fn => fn()));
  } catch (err) {
    console.error("All fetch strategies failed for Steam library:", err);
  }

  if (!xmlContent || typeof xmlContent !== "string") {
    return { success: false, error: "Unable to reach Steam services. Please check your internet connection or try again." };
  }

  // Check for privacy / error tags in XML
  if (xmlContent.includes("<error>")) {
    const errMatch = xmlContent.match(/<error><!\[CDATA\[(.*?)\]\]><\/error>/) || xmlContent.match(/<error>(.*?)<\/error>/);
    const rawError = errMatch ? errMatch[1] : "Steam profile error";
    if (rawError.toLowerCase().includes("private") || rawError.toLowerCase().includes("hidden")) {
      return {
        success: false,
        error: "This Steam profile is Private. Please set 'Game Details' to 'Public' in your Steam Privacy Settings."
      };
    }
    return { success: false, error: rawError };
  }

  if (xmlContent.includes("<privacyState>private") || xmlContent.includes("<privacyState>friendsonly")) {
    return {
      success: false,
      error: "This Steam profile's games are set to Private or Friends Only. Please set 'Game Details' to 'Public' in your Steam Privacy Settings."
    };
  }

  // Extract persona name & avatar if available
  const nameMatch = xmlContent.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/) || xmlContent.match(/<steamID>(.*?)<\/steamID>/);
  const avatarMatch = xmlContent.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/) || xmlContent.match(/<avatarIcon><!\[CDATA\[(.*?)\]\]><\/avatarIcon>/);

  const personaName = nameMatch ? nameMatch[1] : cleanedId;
  const avatar = avatarMatch ? avatarMatch[1] : null;

  // Extract appIDs from XML: app/12345, statsName>12345, <appID>105600</appID>
  const appMatches = [...xmlContent.matchAll(/app\/(\d+)|statsName>(\d+)|<appID>(?:<!\[CDATA\[)?(\d+)(?:\]\]>)?<\/appID>/gi)];
  const ownedAppIds = [...new Set(appMatches.map(m => m[1] || m[2] || m[3]))].filter(Boolean);

  if (!ownedAppIds.length) {
    return {
      success: false,
      error: "No games found on this profile, or your Steam 'Game Details' privacy is not set to Public."
    };
  }

  return {
    success: true,
    steamId: cleanedId,
    personaName,
    avatar,
    ownedAppIds,
    totalOwned: ownedAppIds.length,
  };
}



