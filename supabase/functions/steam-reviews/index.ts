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
    const url = new URL(req.url);
    const appId = url.searchParams.get("appid");
    const lang = url.searchParams.get("lang") || "english";
    const num = url.searchParams.get("num_per_page") || "50";
    const filter = url.searchParams.get("filter") || "all";

    if (!appId) {
      return new Response(JSON.stringify({ error: "Missing appid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const steamUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=${lang}&num_per_page=${num}&filter=${filter}&review_type=all&purchase_type=all`;

    const steamRes = await fetch(steamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });

    if (!steamRes.ok) {
      return new Response(JSON.stringify({ error: `Steam returned ${steamRes.status}` }), {
        status: steamRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await steamRes.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
