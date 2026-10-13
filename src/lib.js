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
    keywords: (d.keywords?.keywords || []).slice(0, 10).map((k) => k.name),
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
  if (/arrow/.test(e)) out.push("Arrow Video");
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

// ─── Copies (the physical discs you own of a film) ─────────────────────
export const FORMATS = ["4K", "Blu-ray", "DVD", "Other", "Digital 4K", "Digital HD", "Digital SD"];
// Digital copies carry their resolution in the format name, like discs do (4K UHD = 2160p, Blu-ray = 1080p).
export const isDigital = (c) => /^Digital/.test(c.format || "");
export const CODE_QUALITIES = ["4K", "HD"];
export const PACKAGES = ["Standard", "Steelbook", "Limited", "Collector's", "Box set"];
// A copy's packaging is a list now (a limited collector's steelbook is all three). Older copies stored one
// string, with "Standard" meaning none; read both.
export const pkgsOf = (c) => {
  const v = Array.isArray(c.package) ? c.package : c.package ? [c.package] : [];
  return PACKAGES.filter((p) => p !== "Standard" && v.includes(p));
};
export const REGIONS = ["A", "B", "C", "Free"];
const LABEL_PATTERNS = [
  [/criterion/, "Criterion"], [/arrow/, "Arrow Video"], [/vinegar/, "Vinegar Syndrome"], [/radiance/, "Radiance"],
  [/shout|scream factory/, "Shout! Scream Factory"], [/kino/, "Kino Lorber"], [/\ba24\b/, "A24"], [/film vault/, "The Film Vault"],
  [/88 films/, "88 Films"], [/second sight/, "Second Sight"], [/eureka|masters of cinema/, "Eureka"], [/severin/, "Severin"],
  [/umbrella/, "Umbrella"], [/indicator|powerhouse/, "Indicator"], [/imprint/, "Imprint"], [/\bnova\b/, "Nova Media"],
  [/mondo/, "Mondo"], [/zavvi/, "Zavvi"], [/blue underground/, "Blue Underground"], [/synapse/, "Synapse"],
  [/warner/, "Warner"], [/universal/, "Universal"], [/sony/, "Sony"], [/paramount/, "Paramount"], [/disney/, "Disney"],
  [/lionsgate/, "Lionsgate"], [/neon\b/, "Neon"], [/third window/, "Third Window"], [/well go/, "Well Go USA"],
];
export const KNOWN_LABELS = LABEL_PATTERNS.map((l) => l[1]);
// One name per label, however it was typed: Shout/Scream reads as "Shout! Scream Factory", Arrow as "Arrow Video".
const LABEL_ALIASES = { shout: "Shout! Scream Factory", shoutfactory: "Shout! Scream Factory", screamfactory: "Shout! Scream Factory", shoutscreamfactory: "Shout! Scream Factory", arrow: "Arrow Video", arrowvideo: "Arrow Video" };
export const canonicalLabel = (l) => {
  if (!l) return l;
  const t = l.trim();
  return LABEL_ALIASES[t.toLowerCase().replace(/[^a-z]/g, "")] || t;
};
export const newId = () => Math.random().toString(36).slice(2, 9);

// Turn a free-text Letterboxd note ("2 copies. 4k steelbook & blu ray steelbook") into suggested copies.
export function parseEdition(text = "") {
  let t = text.toLowerCase().replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/[’`]/g, "'");
  t = t.replace(/\b\d+\s+copies\.?/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/black\s*(&|and)\s*chrome/g, "blackxchrome");
  if (!t) return [];
  const out = [];
  t.split(/,|&|\band\b|\+|;/).map((s) => s.trim()).filter(Boolean).forEach((part) => {
    const n = +(part.match(/^(\d+)\s+/) || [])[1] || 1;
    const format = /\b4k\b|uhd/.test(part) ? "4K" : /blu.?ray|\bbd\b/.test(part) ? "Blu-ray" : /dvd/.test(part) ? "DVD" : "";
    const pkg = [/steel/.test(part) && "Steelbook", /limited/.test(part) && "Limited", /collector/.test(part) && "Collector's",
      /collection|box|trilogy/.test(part) && "Box set"].filter(Boolean);
    const lab = LABEL_PATTERNS.find(([re]) => re.test(part));
    const leftover = part
      .replace(/^\d+\s+/, "").replace(/\b4k\b|uhd|blu.?rays?|\bbd\b|dvds?|steelbooks?|collector'?s?|edition|limited|ultra hd/g, "")
      .replace(lab ? lab[0] : /$^/, "").replace(/\bthe\b|\bw\/|\s+/g, " ").trim();
    const note = leftover.length > 2
      ? part.replace(/^\d+\s+/, "").replace("blackxchrome", "Black & Chrome").replace(/^\w/, (c) => c.toUpperCase()) : "";
    for (let i = 0; i < Math.min(n, 6); i++) out.push({ id: newId(), format, package: pkg, label: lab ? lab[1] : "", note });
  });
  return out;
}

export function copyBadges(copies) {
  const out = [];
  if (copies.some((c) => c.format === "4K")) out.push("4K");
  if (copies.length && copies.every(isDigital)) out.push("Digital only");
  if (copies.some((c) => pkgsOf(c).includes("Steelbook"))) out.push("Steelbook");
  [...new Set(copies.map((c) => c.label).filter(Boolean))].forEach((l) => out.push(l));
  const physical = copies.filter((c) => !isDigital(c));
  if (physical.length > 1) out.push(physical.length + " copies");
  return out;
}

export const copyLine = (c) => (isDigital(c) ? c.label || "Digital copy" : [...pkgsOf(c), c.label || null].filter(Boolean).join(" · ") || "Standard");
export const money = (n) => (n == null || n === "" ? "" : "$" + Number(n).toFixed(Number(n) % 1 ? 2 : 0));
