// Vercel serverless function: a narrow proxy to TMDB so the API key never ships to the browser.
// Set TMDB_API_KEY in Vercel → Project → Settings → Environment Variables.
// Accepts either the short v3 "API Key" or the long v4 "Read Access Token".

const ALLOWED = [
  /^\/search\/movie$/,
  /^\/(movie|tv)\/\d+$/,
  /^\/(movie|tv)\/\d+\/images$/,
];
const PASS_PARAMS = ["query", "year", "include_image_language", "language", "page"];

export default async function handler(req, res) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return res.status(500).json({ error: "TMDB_API_KEY isn't set in Vercel yet." });

  const path = String(req.query.path || "");
  if (!ALLOWED.some((re) => re.test(path))) return res.status(400).json({ error: "Unsupported TMDB path." });

  const url = new URL("https://api.themoviedb.org/3" + path);
  for (const p of PASS_PARAMS) if (req.query[p]) url.searchParams.set(p, String(req.query[p]));
  const headers = { accept: "application/json" };
  if (key.length > 40) headers.authorization = "Bearer " + key;
  else url.searchParams.set("api_key", key);

  try {
    const r = await fetch(url, { headers });
    const body = await r.text();
    // Poster lists barely change; let Vercel's edge cache absorb repeat requests.
    if (r.ok) res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("Content-Type", "application/json");
    return res.status(r.status).send(body);
  } catch {
    return res.status(502).json({ error: "Couldn't reach TMDB." });
  }
}
