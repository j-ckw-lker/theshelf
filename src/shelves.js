// Tonight's filters and Home's shelf recipes. Each test takes a derived film
// (see deriveFilm in App.jsx): genres, countries, keywords, runtime, tags, badges…

import { yearsSince, rng, shuffled, runtimeLabel } from "./lib.js";
import curatedRaw from "./curated.json";
import { seasonList, seasonOptions, seasonActive, SPECIFIC_SEASONS } from "./seasons.js";

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
// Home's own shelves join as filters too, so Pick another can draw from "Hidden gems" or "Michael Mann".
// Shelves an existing group already covers (genres, eras, lengths, last watched, editions, tags) are left out.
const SHELF_DUPES = new Set(["asia", "horror", "scifi5", "comedy", "war", "animation", "five", "short", "epic", "dusty", "never", "editions", "tag:comfort", "tag:rewatch", "tag:hidden"]);
export const makeFilters = (customTags = [], hiddenTags = [], recipes = [], feels = feelList(), seasons = seasonList()) => [
  ["mood", "Mood", [
    ["comfort", "Comfort", (f) => (f.rating ?? 0) >= 4.5 || f.tags.includes("comfort")],
    ["five", "5 stars", (f) => f.rating === 5],
  ]],
  ["shelf", "Shelf", recipes
    .filter((r) => r.kind !== "person" && !THEME_IDS.includes(r.id) && !FEEL_IDS.includes(r.id) && !r.id.startsWith("c:") && !r.id.startsWith("season:") && !SHELF_DUPES.has(r.id) && !r.id.startsWith("dec") && !(r.id.startsWith("tag:") && customTags.includes(r.id.slice(4))))
    .map((r) => [r.id, r.title, r.test])],
  ["theme", "Theme", THEMES.map(([id, title]) => [id, title, (f) => f.themes.includes(id)])],
  ["feel", "Feel", feelOptions(feels)],
  ["season", "Season", seasonOptions(seasons)],
  ["people", "People", recipes
    .filter((r) => r.kind === "person")
    .sort((a, b) => b.id.startsWith("dir:") - a.id.startsWith("dir:") || b.films.length - a.films.length || a.title.localeCompare(b.title))
    .map((r) => [r.id, r.title, r.test])],
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

export const filterTest = (defs, filters, skipKey) => (f) =>
  !f.tags.includes("sell") &&
  defs.every(([key, , opts]) => {
    if (key === skipKey) return true;
    const sel = filters[key];
    if (!sel || sel === "any") return true;
    // Feel can hold several picks and needs all of them; every other group holds one.
    if (Array.isArray(sel)) return sel.every((v) => { const o = opts.find((x) => x[0] === v); return !o || o[2](f); });
    const opt = opts.find((o) => o[0] === sel);
    return !opt || opt[2](f);
  });

export const activeFilterLabels = (defs, filters) =>
  defs.flatMap(([key, , opts]) => {
    const picked = [].concat(filters[key] ?? []);
    return picked.flatMap((v) => { const opt = opts.find((o) => o[0] === v); return opt ? [opt[1]] : []; });
  });

// ─── Home shelves ───────────────────────────────────────────────────────
const yearSub = (f) => f.year;

// Feel: hand-picked lists (src/curated.json) of how a film hits. TMDB keywords can't see this, so a person picks.
// They're stored as themes, so the per-film add/remove on the film page works the same as for keyword themes.
const curated = Object.fromEntries(Object.entries(curatedRaw).map(([k, v]) => [k, new Set(v)]));
const inList = (id) => (f) => curated[id].has(f.key);
export const FEEL_SEEDED = "2026-11-21"; // films that arrive after this and carry no feel show up under "New, no feel yet"

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
  // Romance + Comedy on TMDB, minus the ones that only share the tags.
  ["romcom", "Rom-com", (f) => f.genres.includes("Romance") && f.genres.includes("Comedy") && !["The Mask|1994", "Anora|2024", "Poor Things|2023", "Weird Science|1985"].includes(f.key)],
  // Keyword catches most; Watchmen and Joker are comic-book films TMDB doesn't tag as superhero.
  ["capeshit", "Cape shit", (f) => hasKw("superhero")(f) || ["Watchmen|2009", "Joker|2019"].includes(f.key)],
  ["horror", "Lights off: horror", hasGenre("Horror")],
  ["scifi5", "Sci-fi you rated 5 stars", (f) => f.genres.includes("Science Fiction") && f.rating === 5],
  ["comedy", "Comedy, for when it's been a week", hasGenre("Comedy")],
  ["war", "War films", hasGenre("War")],
  ["animation", "Animated", hasGenre("Animation")],
  ["five", "Five stars, no notes", (f) => f.rating === 5],
  ["dialogue", "Dialogue-driven", inList("dialogue")],
  ["adrenaline", "Adrenaline", inList("adrenaline")],
  ["sensory", "Sensory overload", inList("sensory")],
  ["mind", "Mind-bending", inList("mind")],
  ["trippy", "Hallucinatory", inList("trippy")],
  ["dread", "Dread", inList("dread")],
  ["comfort", "Comfort watch", (f) => curated.comfort.has(f.key) || (f.tags || []).includes("comfort")], // the curated list plus anything you tagged "comfort"
  ["quotable", "Funny: quotable", inList("quotable")],
  ["darkcomedy", "Funny: dark and cringe", inList("darkcomedy")],
  ["absurd", "Funny: absurd", inList("absurd")],
  ["slowburn", "Slow burn", inList("slowburn")],
  ["gutpunch", "Gut-punch", inList("gutpunch")],
  ["paranoid", "Paranoid", inList("paranoid")],
  ["neon", "Neon grime", inList("neon")],
  // Short and propulsive: under 100 minutes and already a fast feel. Reads the lists directly because themes aren't built yet.
  ["shortfuse", "Short fuse", (f) => !!f.runtime && f.runtime <= 100 && ["adrenaline", "dialogue", "dread"].some((id) => curated[id].has(f.key))],
  // Commit to it: 150 minutes or longer. The mirror of Short fuse.
  ["marathon", "Marathon", (f) => !!f.runtime && f.runtime >= 150],
];

// Keyword themes, reused as a Theme filter in the Library (the genre/country/rating vibes are filters already).
const THEME_IDS = ["yakuza", "heist", "hitmen", "paranoia", "killers", "spies", "dystopia", "revenge", "martial", "bw", "nyc", "la", "gangsters", "satire", "timetravel", "vampires", "capeshit", "romcom"];
export const THEMES = VIBES.filter((v) => THEME_IDS.includes(v[0]));
const FEEL_IDS = ["dialogue", "adrenaline", "sensory", "mind", "trippy", "dread", "comfort", "quotable", "darkcomedy", "absurd", "slowburn", "gutpunch", "paranoid", "neon", "shortfuse", "marathon"];
export const FEELS = VIBES.filter((v) => FEEL_IDS.includes(v[0]));
export const ALL_THEMES = [...THEMES, ...FEELS]; // what a film's `themes` can hold
const hasFeel = (f) => f.themes.some((id) => FEEL_IDS.includes(id) || id.startsWith("c:"));
// Films added after the lists were seeded, with no feel yet: the to-do list for tagging new purchases.
export const unfelt = (f) => !hasFeel(f) && typeof f.addedKey === "string" && f.addedKey > FEEL_SEEDED;
// Your Feel setup: built-ins can be renamed or removed, and you can add your own ("c:" ids). cfg = { custom, names, hidden }.
export const NO_FEEL_CFG = { custom: [], names: {}, hidden: [] };
export const feelList = (cfg = NO_FEEL_CFG) => [
  ...FEELS.filter(([id]) => !(cfg.hidden || []).includes(id)).map(([id, title]) => [id, (cfg.names || {})[id] || title]),
  ...(cfg.custom || []).map((c) => [c.id, c.name]),
];
export const feelOptions = (list = feelList(), count = () => 1) => [
  ...list.map(([id, title]) => [id, title, (f) => f.themes.includes(id)]).filter((o) => count(o[2]) > 0),
  ["unfelt", "New, no feel yet", unfelt],
];

export function buildRecipes(films, customTags = [], feelCfg = NO_FEEL_CFG, seasonCfg = undefined, today = new Date()) {
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

  // Themes use each film's corrected theme list, so hand edits on a film page flow into Home.
  VIBES.forEach(([id, title, test]) => !(FEEL_IDS.includes(id) && (feelCfg.hidden || []).includes(id)) && add({ id, title: (FEEL_IDS.includes(id) && (feelCfg.names || {})[id]) || title, test: THEME_IDS.includes(id) || FEEL_IDS.includes(id) ? (f) => f.themes.includes(id) : test }));
  (feelCfg.custom || []).forEach((c) => add({ id: c.id, title: c.name, test: (f) => f.themes.includes(c.id) }));

  // Seasons: a shelf for each built-in season while it's the right time of year (see SEASON_WINDOWS).
  const nowSeasons = seasonList(seasonCfg).filter(([id]) => seasonActive(id, today));
  const specific = nowSeasons.some(([id]) => SPECIFIC_SEASONS.includes(id));
  nowSeasons.forEach(([id, name]) => {
    const pin = SPECIFIC_SEASONS.includes(id) || !specific; // a general season is pinned too when no specific one is on
    add({ id: "season:" + id, title: name + " watches", min: 3, pin, weight: 6, test: (f) => (f.seasons || []).includes(id) });
  });

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
  const pinned = recipes.filter((r) => r.pin).slice(0, 2); // in-season Halloween / Christmas: always dealt, always first
  const rest = recipes
    .filter((r) => !r.pin)
    .map((r) => ({ r, k: Math.pow(rand(), 1 / (r.weight || 1)) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.r);
  const picked = [...pinned];
  let people = 0, colors = 0;
  for (const r of rest) {
    if (picked.length >= count) break;
    const cap = picked.length < 6 ? 2 : 3 + Math.floor((picked.length - 6) / 3);
    if (r.kind === "person") { if (people >= cap) continue; people++; }
    if (r.kind === "color") { if (colors >= 1) continue; colors++; } // a color shelf is a treat: one per deal
    picked.push(r);
  }
  return picked.slice(0, count).map((r) => {
    const deal = shuffled(r.films, rand).slice(0, 15);
    return { ...r, deal: r.order ? deal.sort(r.order) : deal }; // color shelves lay out as a gradient
  });
}
