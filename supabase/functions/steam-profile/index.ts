import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY");
    if (!STEAM_API_KEY) {
      return new Response(JSON.stringify({ error: "Steam API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const steamId = url.searchParams.get("steamid");
    const vanity = url.searchParams.get("vanity");

    if (!steamId && !vanity) {
      return new Response(JSON.stringify({ error: "Missing steamid or vanity parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let resolvedSteamId = steamId;

    // Resolve vanity URL to SteamID64 first
    if (!resolvedSteamId && vanity) {
      const resolveUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`;
      const resolveRes = await fetch(resolveUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (resolveRes.ok) {
        const data = await resolveRes.json();
        if (data?.response?.success === 1) {
          resolvedSteamId = data.response.steamid;
        }
      }
      if (!resolvedSteamId) {
        return new Response(JSON.stringify({ error: "Could not resolve Steam vanity URL. Make sure the custom URL is correct." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch profile summary for name + avatar
    const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${resolvedSteamId}`;
    const ownedUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${resolvedSteamId}&include_appinfo=false&include_played_free_games=false&format=json`;

    // Fetch both in parallel
    const [summaryRes, ownedRes] = await Promise.all([
      fetch(summaryUrl, { headers: { "User-Agent": "Mozilla/5.0" } }),
      fetch(ownedUrl, { headers: { "User-Agent": "Mozilla/5.0" } }),
    ]);

    const summaryData = summaryRes.ok ? await summaryRes.json() : null;
    const ownedData = ownedRes.ok ? await ownedRes.json() : null;

    const player = summaryData?.response?.players?.[0];
    const games = ownedData?.response?.games;

    if (!games) {
      // Profile may be private
      return new Response(JSON.stringify({
        error: "Could not retrieve game library. The profile may be private. Please set 'Game Details' to 'Public' in Steam Privacy Settings.",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      steamId: resolvedSteamId,
      personaName: player?.personaname || resolvedSteamId,
      avatar: player?.avatarfull || null,
      ownedAppIds: games.map((g) => String(g.appid)),
      totalOwned: games.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
