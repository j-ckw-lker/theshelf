// Vercel serverless function: hands a small TMDB poster back from this site's own address, so the app can
// read its pixels (for sorting the Library by color) even if TMDB's image server doesn't allow that directly.
// Only small poster sizes, only TMDB image paths. Edge-cached for a year: a path's image never changes.
export default async function handler(req, res) {
  const p = String(req.query.p || "");
  const size = req.query.size === "w185" ? "w185" : "w92";
  if (!/^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(p)) return res.status(400).json({ error: "Pass ?p=/<tmdb image path>." });
  try {
    const r = await fetch(`https://image.tmdb.org/t/p/${size}${p}`);
    if (!r.ok) return res.status(r.status).end();
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: e.message || "Couldn't reach TMDB." });
  }
}
