// Tonight's filters and Home's shelf recipes. Each test takes a derived film
// (see deriveFilm in App.jsx): genres, countries, keywords, runtime, tags, badges…

import { yearsSince, rng, shuffled, runtimeLabel } from "./lib.js";

export const TAGS = {
  comfort: "Comfort",
  upgrade: "Upgrade",
  hidden: "Gem",
  rewatch: "Rewatch",
  sell: "Sell",
};

const hasGenre = (g) => (f) => f.genres.includes(g);
const hasKw = (...ks) => (f) => ks.some((k) => f.keywords.includes(k));
const fromCountry = (...cs) => (f) => cs.some((c) => f.countries.includes(c));
const tagged = (t) => (f) => f.tags.includes(t);

// ─── Tonight's filters ──────────────────────────────────────────────────
// [key, label, [[optionKey, label, test], …]]. "any" is implied first.
export const makeFilters = (customTags = []) => [
  ["mood", "Mood", [
    ["comfort", "Comfort", (f) => (f.rating ?? 0) >= 4.5 || f.tags.includes("comfort")],
    ["five", "5 stars", (f) => f.rating === 5],
    ["rewatch", "Tagged rewatch", tagged("rewatch")],
    ["gem", "Tagged gem", tagged("hidden")],
    ...customTags.map((t) => ["tag:" + t, t, tagged(t)]),
  ]],
  ["genre", "Genre", [
    ["action", "Action", hasGenre("Action")],
    ["animation", "Animation", hasGenre("Animation")],
    ["comedy", "Comedy", hasGenre("Comedy")],
    ["crime", "Crime", hasGenre("Crime")],
    ["drama", "Drama", hasGenre("Drama")],
    ["fantasy", "Fantasy", hasGenre("Fantasy")],
    ["horror", "Horror", hasGenre("Horror")],
    ["mystery", "Mystery", hasGenre("Mystery")],
    ["romance", "Romance", hasGenre("Romance")],
    ["scifi", "Sci-fi", hasGenre("Science Fiction")],
    ["thriller", "Thriller", hasGenre("Thriller")],
    ["war", "War", hasGenre("War")],
  ]],
  ["country", "Country", [
    ["us", "US", fromCountry("US")],
    ["uk", "UK", fromCountry("GB")],
    ["japan", "Japan", fromCountry("JP")],
    ["hk", "Hong Kong & Korea", fromCountry("HK", "KR", "TW", "CN")],
    ["europe", "France & Italy", fromCountry("FR", "IT")],
  ]],
  ["era", "Era", [
    ["pre70", "Before 1970", (f) => f.yearNum < 1970],
    ["7080", "70s & 80s", (f) => f.yearNum >= 1970 && f.yearNum < 1990],
    ["9000", "90s & 00s", (f) => f.yearNum >= 1990 && f.yearNum < 2010],
    ["recent", "2010 on", (f) => f.yearNum >= 2010],
  ]],
  ["length", "Length", [
    ["u100", "Under 100 min", (f) => f.runtime && f.runtime < 100],
    ["u120", "Under 2 hours", (f) => f.runtime && f.runtime < 120],
    ["mid", "2 to 2½ hours", (f) => f.runtime >= 120 && f.runtime < 150],
    ["epic", "2½ hours+", (f) => f.runtime >= 150],
  ]],
  ["seen", "Last watched", [
    ["y1", "Over a year ago", (f) => f.lastWatched && yearsSince(f.lastWatched) > 1],
    ["y2", "Over 2 years ago", (f) => f.lastWatched && yearsSince(f.lastWatched) > 2],
    ["never", "Never logged", (f) => !f.lastWatched],
  ]],
  ["format", "Format", [
    ["4k", "4K", (f) => f.badges.includes("4K")],
    ["steel", "Steelbook", (f) => f.badges.includes("Steelbook")],
    ["special", "Any special edition", (f) => f.special],
  ]],
];
export const FILTERS = makeFilters();

export const filterTest = (defs, filters, skipKey) => (f) =>
  !f.tags.includes("sell") &&
  defs.every(([key, , opts]) => {
    if (key === skipKey) return true;
    const sel = filters[key];
    if (!sel || sel === "any") return true;
    const opt = opts.find((o) => o[0] === sel);
    return !opt || opt[2](f);
  });

export const activeFilterLabels = (defs, filters) =>
  defs.flatMap(([key, , opts]) => {
    const opt = opts.find((o) => o[0] === filters[key]);
    return opt ? [opt[1]] : [];
  });

// ─── Home shelves ───────────────────────────────────────────────────────
const yearSub = (f) => f.year;

const VIBES = [
  ["asia", "Japan, Hong Kong & Korea", fromCountry("JP", "HK", "KR")],
  ["yakuza", "Yakuza pictures", hasKw("yakuza")],
  ["heist", "Heist night", hasKw("heist", "robbery", "bank robbery")],
  ["hitmen", "Hitmen and assassins", hasKw("hitman", "assassin")],
  ["paranoia", "Paranoia and conspiracy", hasKw("paranoia", "conspiracy")],
  ["killers", "Serial killers", hasKw("serial killer")],
  ["spies", "Spies", hasKw("spy", "espionage")],
  ["dystopia", "Dystopias", hasKw("dystopia")],
  ["revenge", "Revenge", hasKw("revenge")],
  ["martial", "Martial arts", hasKw("martial arts", "kung fu")],
  ["bw", "In black and white", hasKw("black and white")],
  ["nyc", "New York stories", hasKw("new york city")],
  ["la", "Los Angeles after dark", hasKw("los angeles, california")],
  ["gangsters", "Gangsters", hasKw("gangster", "mafia")],
  ["satire", "Satire", hasKw("satire")],
  ["timetravel", "Time travel", hasKw("time travel")],
  ["vampires", "Vampires", hasKw("vampire")],
  ["horror", "Lights off: horror", hasGenre("Horror")],
  ["scifi5", "Sci-fi you rated 5 stars", (f) => f.genres.includes("Science Fiction") && f.rating === 5],
  ["comedy", "Comedy, for when it's been a week", hasGenre("Comedy")],
  ["war", "War films", hasGenre("War")],
  ["animation", "Animated", hasGenre("Animation")],
  ["five", "Five stars, no notes", (f) => f.rating === 5],
];

export function buildRecipes(films, customTags = [], pairs = []) {
  const out = [];
  const add = (r) => {
    const list = films.filter((f) => !f.tags.includes("sell") && r.test(f));
    if (list.length >= (r.min || 6)) out.push({ sub: yearSub, kind: "vibe", ...r, films: list });
  };

  // People: directors with 4+ films, cinematographers and composers with 6+.
  const count = (pick) => {
    const m = new Map();
    films.forEach((f) => pick(f).forEach((n) => m.set(n, (m.get(n) || 0) + 1)));
    return m;
  };
  count((f) => f.directors.slice(0, 1)).forEach((n, name) => {
    if (n >= 4) add({ id: "dir:" + name, kind: "person", title: name, min: 4, test: (f) => f.directors.includes(name) });
  });
  count((f) => f.dop).forEach((n, name) => {
    if (n >= 6) add({ id: "dop:" + name, kind: "person", title: "Shot by " + name, test: (f) => f.dop.includes(name) });
  });
  count((f) => f.music).forEach((n, name) => {
    if (n >= 6) add({ id: "mus:" + name, kind: "person", title: "Scored by " + name, test: (f) => f.music.includes(name) });
  });

  VIBES.forEach(([id, title, test]) => add({ id, title, test }));

  [1960, 1970, 1980, 1990].forEach((d) =>
    add({ id: "dec" + d, title: `The ${String(d).slice(2)}s, on your shelf`, test: (f) => f.yearNum >= d && f.yearNum < d + 10 }));
  add({ id: "short", title: "Under 100 minutes", test: (f) => f.runtime && f.runtime < 100, sub: (f) => runtimeLabel(f.runtime) });
  add({ id: "epic", title: "Clear the evening: 2½ hours+", test: (f) => f.runtime >= 150, sub: (f) => runtimeLabel(f.runtime) });
  add({ id: "dusty", title: "Not watched in over 2 years", test: (f) => f.lastWatched && yearsSince(f.lastWatched) > 2, sub: (f) => "Last " + f.lastWatched.slice(0, 4) });
  add({ id: "never", title: "On the shelf, never logged", test: (f) => !f.lastWatched });
  add({ id: "fresh", title: "Fresh on the shelf", weight: 3, test: (f) => f.recentRank <= 15, sub: (f) => (f.lastWatched ? f.year : "Not watched yet") });
  add({ id: "editions", title: "Special editions", min: 4, test: (f) => f.special, sub: (f) => f.badges[0] || "Special edition" });
  // Shelves you curate yourself (tags, labels) get dealt more often than generic ones.
  [["comfort", "Comfort picks"], ["rewatch", "Due a rewatch"], ["hidden", "Hidden gems"], ["upgrade", "Upgrade candidates"]]
    .forEach(([t, title]) => add({ id: "tag:" + t, title, min: 3, weight: 4, test: (f) => f.tags.includes(t) }));
  customTags.forEach((t) => add({ id: "tag:" + t, title: t, min: 3, weight: 4, test: (f) => f.tags.includes(t) }));
  const labels = new Map();
  films.forEach((f) => f.copies.forEach((c) => c.label && labels.set(c.label, (labels.get(c.label) || 0) + 1)));
  labels.forEach((n, l) => add({ id: "label:" + l, title: "From " + l, min: 3, weight: 2, test: (f) => f.copies.some((c) => c.label === l) }));

  // ── Shelves that react to you ──
  // Because you watched: whatever you logged most recently, and its people.
  const last = films.filter((f) => f.lastWatched).sort((a, b) => b.lastWatched.localeCompare(a.lastWatched))[0];
  if (last) {
    const kin = (f) => f.key !== last.key && (
      f.directors.some((d) => last.directors.includes(d)) || f.dop.some((d) => last.dop.includes(d))
      || f.music.some((m) => last.music.includes(m)) || (last.collection && f.collection === last.collection));
    const why = (f) => {
      const d = f.directors.find((x) => last.directors.includes(x));
      if (d) return "Also " + d.split(" ").slice(-1)[0];
      const p = f.dop.find((x) => last.dop.includes(x));
      if (p) return "Shot by " + p.split(" ").slice(-1)[0];
      const m = f.music.find((x) => last.music.includes(x));
      return m ? "Score: " + m.split(" ").slice(-1)[0] : "Same series";
    };
    add({ id: "because", title: "Because you watched " + last.name, min: 3, weight: 6, test: kin, sub: why });
  }
  // 4K discs that haven't been played since they came home (or ever).
  const bought4k = (f) => f.copies.filter((c) => c.format === "4K").map((c) => c.purchased).filter(Boolean).sort()[0];
  add({
    id: "4k-unplayed", title: "4K discs still waiting for a spin", min: 3, weight: 3,
    test: (f) => f.badges.includes("4K") && (!f.lastWatched || (bought4k(f) && f.lastWatched < bought4k(f))),
    sub: (f) => (f.lastWatched ? "Last " + f.lastWatched.slice(0, 4) : "Never logged"),
  });
  // Directors who've given you a five-star film, and their other work you haven't revisited.
  const fiveDirs = new Set(films.filter((f) => f.rating === 5).flatMap((f) => f.directors));
  add({
    id: "five-dirs", title: "Five-star directors, gathering dust", weight: 3,
    test: (f) => f.directors.some((d) => fiveDirs.has(d)) && (!f.lastWatched || yearsSince(f.lastWatched) > 2),
    sub: (f) => f.directors[0],
  });
  // Double features come from pairs.js (scored on themes, crew, cast, era), passed in by the app.
  if (pairs.length >= 6) {
    const inPair = new Set(pairs.flatMap((p) => [p.a.key, p.b.key]));
    out.push({ id: "pairs", kind: "pairs", title: "Double features", weight: 3, films: pairs, test: (f) => inPair.has(f.key), count: pairs.length });
  }

  // Seasonal shelves jump the queue in their month.
  const month = new Date().getMonth();
  if (month === 9) add({ id: "halloween", title: "Halloween season", weight: 10, test: (f) => f.genres.includes("Horror") || f.keywords.includes("halloween") });
  if (month === 11) add({ id: "christmas", title: "Set at Christmas", weight: 10, min: 3, test: (f) => f.keywords.includes("christmas") });

  return out;
}

// Deal the first `count` shelves of today's order. Decisions only look backwards, so asking for more
// later appends without disturbing what's already on screen. People shelves: 2 in the first six, +1 per three after.
export function dealShelves(recipes, seed, count = 6) {
  const rand = rng(seed);
  const rest = recipes
    .map((r) => ({ r, k: Math.pow(rand(), 1 / (r.weight || 1)) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.r);
  const picked = [];
  let people = 0;
  for (const r of rest) {
    if (picked.length >= count) break;
    const cap = picked.length < 6 ? 2 : 3 + Math.floor((picked.length - 6) / 3);
    if (r.kind === "person") { if (people >= cap) continue; people++; }
    picked.push(r);
  }
  return picked.slice(0, count).map((r) => {
    if (r.kind !== "pairs") return { ...r, deal: shuffled(r.films, rand).slice(0, 15) };
    const used = new Set();
    const deal = shuffled(r.films, rand).filter((p) => {
      if (used.has(p.a.key) || used.has(p.b.key)) return false;
      used.add(p.a.key); used.add(p.b.key); return true;
    }).slice(0, 10);
    return { ...r, deal };
  });
}
