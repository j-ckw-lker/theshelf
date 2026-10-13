// Vercel serverless function: critic scores for a film (IMDb rating, Metascore, Rotten Tomatoes critics %).
// Set OMDB_API_KEY in Vercel → Project → Settings → Environment Variables (free key from omdbapi.com).
// The app asks by TMDB id; this looks up the IMDb id on TMDB (server-side, with TMDB_API_KEY), then asks OMDb.
// Until OMDB_API_KEY exists it answers 503 and the app simply hides scores.

const tmdbKey = () => (process.env.TMDB_API_KEY || process.env.TMDB || "").trim();

async function imdbIdFor(tmdbId) {
  const key = tmdbKey();
  if (!key) throw new Error("TMDB_API_KEY isn't set.");
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}/external_ids`);
  const headers = { accept: "application/json" };
  if (key.length > 40) headers.authorization = "Bearer " + key; else url.searchParams.set("api_key", key);
  const r = await fetch(url, { headers });
  if (!r.ok) return null;
  const j = await r.json();
  return j.imdb_id || null;
}

const num = (s) => { const n = parseFloat(String(s || "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : null; };

export default async function handler(req, res) {
  const key = (process.env.OMDB_API_KEY || "").trim();
  if (!key) return res.status(503).json({ error: "OMDB_API_KEY isn't set in Vercel yet." });
  const tmdb = String(req.query.tmdb || "");
  if (!/^\d+$/.test(tmdb)) return res.status(400).json({ error: "Pass ?tmdb=<id>." });
  try {
    const imdb = await imdbIdFor(tmdb);
    if (!imdb) { res.setHeader("Cache-Control", "public, s-maxage=604800"); return res.status(200).json({ found: false }); }
    const r = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdb)}`);
    const j = await r.json().catch(() => ({}));
    if (j.Response === "False") {
      // Bad key or daily limit: say so without caching; a missing film: cache the miss.
      if (/key|limit/i.test(j.Error || "")) return res.status(502).json({ error: j.Error });
      res.setHeader("Cache-Control", "public, s-maxage=604800");
      return res.status(200).json({ found: false, imdbId: imdb });
    }
    const rt = (j.Ratings || []).find((x) => x.Source === "Rotten Tomatoes");
    const out = { found: true, imdbId: imdb, imdb: num(j.imdbRating), meta: num(j.Metascore), rt: rt ? num(rt.Value) : null, votes: num(j.imdbVotes) };
    // Scores move slowly: let the edge cache hold them for a week.
    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: e.message || "Couldn't reach OMDb." });
  }
}
