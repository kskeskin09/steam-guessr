import rawGamesList from './steamGamesList.json';

// Deduplicate raw games list by unique id
const uniqueGamesMap = new Map();
rawGamesList.forEach(game => {
  const strId = String(game.id);
  if (!uniqueGamesMap.has(strId)) {
    uniqueGamesMap.set(strId, {
      id: strId,
      title: game.title,
      coverImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/header.jpg`
    });
  }
});

export const STEAM_GAMES_DATABASE = Array.from(uniqueGamesMap.values());

// Simple title autocomplete search (Max 5 results by default)
export function searchGames(query, limit = 5) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();

  const seenIds = new Set();
  const results = [];

  for (const g of STEAM_GAMES_DATABASE) {
    if (seenIds.has(g.id)) continue;

    if (g.title.toLowerCase().includes(q)) {
      seenIds.add(g.id);
      results.push(g);
      if (results.length >= limit) break;
    }
  }

  return results;
}
