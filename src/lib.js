// Small shared helpers: storage, TMDB, dates, formatting, seeded randomness.

export const todayISO = () => new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
export const thisYear = () => new Date().getFullYear();

export const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); } catch {} },
};
export const readJSON = (key, fallback) => {
  const v = store.get(key);
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};

export const fkey = (f) => f.name + "|" + f.year;

// ─── TMDB ───────────────────────────────────────────────────────────────
export const img = (path, size = "w342") => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

export async function tmdb(path, params = {}) {
  const r = await fetch("/api/tmdb?" + new URLSearchParams({ path, ...params }));
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || body.status_message || "TMDB request failed (" + r.status + ")");
  return body;
}

// Same shape the enrichment script bakes into collection.json, for films added in the app.
export function shapeTmdbMovie(d) {
  const crew = d.credits?.crew || [];
  const jobs = (...js) => [...new Set(crew.filter((c) => js.includes(c.job)).map((c) => c.name))];
  const best = (list, lang) => (list || [])
    .filter((x) => lang === undefined || x.iso_639_1 === lang)
    .sort((a, b) => b.vote_average - a.vote_average || b.vote_count - a.vote_count)[0];
  const backdrop = best(d.images?.backdrops, null) || best(d.images?.backdrops, "en");
  const logo = best(d.images?.logos, "en") || best(d.images?.logos);
  const out = {
    tmdb: d.id,
    runtime: d.runtime || undefined,
    genres: (d.genres || []).map((g) => g.name),
    directors: jobs("Director").slice(0, 3),
    dop: jobs("Director of Photography").slice(0, 1),
    music: jobs("Original Music Composer", "Music").slice(0, 2),
    cast: (d.credits?.cast || []).slice(0, 3).map((c) => c.name),
    countries: (d.production_countries || []).map((c) => c.iso_3166_1),
    lang: d.original_language || undefined,
    collection: d.belongs_to_collection?.id || undefined,
    poster: d.poster_path || undefined,
    backdrop: backdrop?.file_path || d.backdrop_path || undefined,
    logo: logo?.file_path || undefined,
  };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  }
  return out;
}

// ─── Formatting ─────────────────────────────────────────────────────────
export const fmtDate = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export const runtimeLabel = (m) => (!m ? null : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
export const stars = (r) => (r == null ? "" : "★".repeat(Math.floor(r)) + (r % 1 ? "½" : ""));
export const yearsSince = (d) => (d ? (Date.now() - new Date(d + "T12:00:00")) / (365.25 * 864e5) : Infinity);

export const sortKey = (name) =>
  name.replace(/^(the|a|an) /i, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^[^A-Za-z0-9]+/, "");
export const letterOf = (key) => {
  const c = (key[0] || "#").toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
};

export const peopleLabel = (names = []) => {
  if (!names.length) return "";
  if (names.length === 2 && names[0].split(" ").slice(-1)[0] === names[1].split(" ").slice(-1)[0]) {
    return names[0].split(" ")[0] + " & " + names[1];
  }
  return names.length > 2 ? names.slice(0, 2).join(", ") + " & " + names[2] : names.join(" & ");
};

// Badges read out of the free-text edition note ("2 copies. 4k steelbook & blu ray steelbook").
export function editionBadges(edition = "") {
  const e = edition.toLowerCase();
  const out = [];
  if (/\b4k\b|uhd/.test(e)) out.push("4K");
  if (/steel/.test(e)) out.push("Steelbook");
  if (/collector/.test(e)) out.push("Collector's");
  if (/criterion/.test(e)) out.push("Criterion");
  if (/arrow/.test(e)) out.push("Arrow");
  if (/vinegar/.test(e)) out.push("Vinegar Syndrome");
  const copies = e.match(/(\d+)\s+(copies|blu ray steelbooks|steelbooks)/);
  if (copies && +copies[1] > 1) out.push(copies[1] + " copies");
  return out;
}

// ─── Seeded randomness (stable per day, rerollable) ────────────────────
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
