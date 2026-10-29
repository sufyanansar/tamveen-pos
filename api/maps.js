// /api/maps — which map tiles the apps draw.
//   GET public, ?lang=ar|en: Google Map Tiles (a session URL) when GOOGLE_MAPS_KEY is set, else OpenStreetMap.
// The key lives only in the Vercel env, never in this public repository. Tile URLs still carry it, so in
// Google Cloud restrict the key to the Map Tiles API and give it a daily quota.
import { api } from './_lib/core.js';

const sessions = {}; // lang → { until, tiles }

async function googleTiles(lang) {
  const key = (process.env.GOOGLE_MAPS_KEY || '').trim();
  if (!key) return null;
  const c = sessions[lang];
  if (c && c.until > Date.now()) return c.tiles;
  const r = await fetch('https://tile.googleapis.com/v1/createSession?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'roadmap', language: lang, region: 'SA' }),
  });
  if (!r.ok) { console.error('Google Map Tiles session failed', r.status, (await r.text()).slice(0, 300)); return null; }
  const j = await r.json();
  const tiles = {
    provider: 'google',
    url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(j.session)}&key=${encodeURIComponent(key)}`,
    options: { maxZoom: 21, attribution: 'Map data &copy; ' + new Date().getFullYear() + ' Google' },
  };
  // Sessions last about two weeks; renew a day early, and at least daily on a warm function.
  sessions[lang] = { tiles, until: Math.min(Number(j.expiry) * 1000 - 864e5, Date.now() + 864e5) };
  return tiles;
}

export default api({
  GET: async ({ res, query }) => {
    const tiles = await googleTiles(query.lang === 'ar' ? 'ar' : 'en').catch((e) => { console.error(e); return null; });
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return tiles || { provider: 'osm' };
  },
});
