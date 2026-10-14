// Double features: score how well two films from the shelf play together, and say why.
// Every link is a reason you can read. Rare shared keywords count for more than common ones.

const BORING_KW = new Set([
  "duringcreditsstinger", "aftercreditsstinger", "superhero", "based on comic", "sequel", "remake", "prequel",
  "based on novel or book", "based on true story", "biography", "woman director", "murder", "new york city",
  "los angeles, california", "based on video game", "based on young adult novel", "anime", "live action remake",
  "based on play or musical", "based on short story", "based on tv series", "3d", "independent film", "lgbt",
  "duringcreditsstinger", "based on comic book", "aftercredits stinger", "male friendship", "friendship", "love",
  "loss of loved one", "sadness", "dying and death", "death", "violence", "family", "husband wife relationship",
  "father son relationship", "father daughter relationship", "mother son relationship", "mother daughter relationship",
  "sibling relationship", "chase", "suicide attempt", "suicide",
]);
const COUNTRY_ADJ = {
  JP: "Japanese", HK: "Hong Kong", KR: "Korean", FR: "French", IT: "Italian", DE: "German", GB: "British",
  CN: "Chinese", TW: "Taiwanese", ES: "Spanish", MX: "Mexican", SE: "Swedish", DK: "Danish", AU: "Australian",
  CA: "Canadian", IN: "Indian", RU: "Russian", SU: "Soviet", PL: "Polish", GR: "Greek", NZ: "New Zealand", IE: "Irish",
};
// "Robert De Niro" -> "De Niro", "Lee Van Cleef" -> "Van Cleef".
const last = (name) => {
  const w = name.split(" ");
  return w.length > 2 && /^(de|del|della|di|da|van|von|le|la|du|st\.?)$/i.test(w[w.length - 2]) ? w.slice(-2).join(" ") : w[w.length - 1];
};
// TMDB keywords read like database tags ("paris, france"): drop the country tail and title-case them.
const kwLabel = (k) => k.replace(/,.*$/, "").replace(/\b\w/g, (c) => c.toUpperCase());
// Which reason gets said first. Score decides whether two films pair; this decides how the pair is explained:
// a shared director is the headline even when a pile of shared keywords outscored it.
const SAY_FIRST = { director: 0, cast: 1, series: 2, craft: 3, theme: 4, place: 5, time: 6 };
const titleWords = (f) => new Set((f.name.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((w) => !["with", "from", "that", "this", "night"].includes(w)));

// Build once per collection: keyword rarity and the per-film sets the scorer needs.
export function pairIndex(films) {
  const df = new Map();
  films.forEach((f) => new Set(f.keywords).forEach((k) => df.set(k, (df.get(k) || 0) + 1)));
  const N = films.length;
  const idf = (k) => (BORING_KW.has(k) || (df.get(k) || 0) < 2 || df.get(k) > 40 ? 0 : Math.log(N / df.get(k)));
  const prep = new Map(films.map((f) => [f.key, {
    kw: new Set(f.keywords.filter((k) => idf(k) > 0)),
    cast: new Set(f.cast.slice(0, 3)),
    words: titleWords(f),
  }]));
  return { idf, prep, films };
}

// Score a pair. mode "feed" skips sequels and franchise lookalikes; "build" keeps them with a reason.
export function scorePair(ix, a, b, mode = "build") {
  if (a.key === b.key) return null;
  const pa = ix.prep.get(a.key), pb = ix.prep.get(b.key);
  if (!pa || !pb) return null;
  const sameSeries = a.collection && a.collection === b.collection;
  const lookalike = [...pb.words].some((w) => pa.words.has(w));
  if (mode === "feed" && (sameSeries || lookalike)) return null;

  const reasons = [];
  let score = 0;
  const kws = [...pa.kw].filter((k) => pb.kw.has(k)).map((k) => [k, ix.idf(k)]).sort((x, y) => y[1] - x[1]);
  const kwScore = 0.75 * kws.reduce((n, [, w]) => n + w, 0);
  score += kwScore;
  if (kws.length) reasons.push({ w: kwScore, text: kws.slice(0, 2).map((k) => kwLabel(k[0])).join(" · "), kind: "theme" });

  const dp = a.dop.find((d) => b.dop.includes(d));
  if (dp) { score += 3.5; reasons.push({ w: 3.5, text: "Both shot by " + dp, kind: "craft" }); }
  const mus = a.music.find((m) => b.music.includes(m));
  if (mus) { score += 3; reasons.push({ w: 3, text: "Both scored by " + mus, kind: "craft" }); }
  const actors = [...pa.cast].filter((c) => pb.cast.has(c));
  if (actors.length) { const w = 2.5 * actors.length; score += w; reasons.push({ w, text: "Both star " + actors.map(last).join(" & "), kind: "people", say: "cast" }); }
  const dir = a.directors.find((d) => b.directors.includes(d));
  // Family-name-first names (Wong Kar-wai, Bong Joon-ho) end in a hyphenated given name: keep those whole.
  if (dir) { score += 4; reasons.push({ w: 4, text: "Both " + (/-/.test(dir.split(" ").pop()) ? dir : last(dir)), kind: "people", say: "director" }); }
  if (sameSeries) { score += 2; reasons.push({ w: 2, text: "Same series", kind: "people", say: "series" }); }

  const gap = Math.abs(a.yearNum - b.yearNum);
  if (gap === 0) { score += 1.2; reasons.push({ w: 1.2, text: "Both " + a.year, kind: "time" }); }
  else if (gap >= 20 && kwScore >= 4) { score += 1; reasons.push({ w: 1, text: gap + " years apart", kind: "time" }); }
  const country = a.countries.find((c) => c !== "US" && b.countries.includes(c));
  if (country && COUNTRY_ADJ[country]) { score += 1; reasons.push({ w: 1, text: "Both " + COUNTRY_ADJ[country], kind: "place" }); }
  const genres = a.genres.filter((g) => b.genres.includes(g)).length;
  score += Math.min(genres, 3) * 0.3;

  if (score < 1) return null;
  reasons.sort((x, y) => SAY_FIRST[x.say || x.kind] - SAY_FIRST[y.say || y.kind] || y.w - x.w);
  const [first, second] = a.yearNum <= b.yearNum ? [a, b] : [b, a];
  return { key: first.key + "+" + second.key, a: first, b: second, score, reasons };
}

// Best partners on the shelf for one film.
export function partnersFor(ix, film, limit = 40) {
  return ix.films
    .filter((f) => !f.tags.includes("sell"))
    .map((f) => scorePair(ix, film, f, "build"))
    .filter(Boolean)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

// The whole shelf's strongest pairings, no film used more than twice so the feed doesn't turn into the Batman show.
export function bestPairs(ix, limit = 150) {
  const films = ix.films.filter((f) => !f.tags.includes("sell"));
  // Only pairs that share something specific can reach the bar, so gather candidates from inverted indexes
  // (keywords, crew, cast) instead of scoring all ~170k pairs.
  const buckets = new Map();
  const put = (k, i) => (buckets.get(k) || buckets.set(k, []).get(k)).push(i);
  films.forEach((f, i) => {
    const pr = ix.prep.get(f.key);
    pr.kw.forEach((k) => put("k:" + k, i));
    pr.cast.forEach((c) => put("c:" + c, i));
    f.dop.forEach((d) => put("d:" + d, i));
    f.music.forEach((m) => put("m:" + m, i));
    f.directors.forEach((d) => put("r:" + d, i));
  });
  const seen = new Set();
  const all = [];
  buckets.forEach((list) => {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const id = list[x] * 4096 + list[y];
      if (seen.has(id)) continue;
      seen.add(id);
      const p = scorePair(ix, films[list[x]], films[list[y]], "feed");
      if (p && p.score >= 5) all.push(p);
    }
  });

  all.sort((x, y) => y.score - x.score);
  const uses = new Map();
  const out = [];
  for (const p of all) {
    if ((uses.get(p.a.key) || 0) >= 2 || (uses.get(p.b.key) || 0) >= 2) continue;
    uses.set(p.a.key, (uses.get(p.a.key) || 0) + 1);
    uses.set(p.b.key, (uses.get(p.b.key) || 0) + 1);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

// A night's math: total running time with a short break, and when to start to finish by a given hour.
export function nightPlan(a, b, finishHour = 23, breakMin = 15) {
  if (!a.runtime || !b.runtime) return null;
  const total = a.runtime + b.runtime + breakMin;
  const start = finishHour * 60 - total;
  const h = Math.floor(((start % 1440) + 1440) % 1440 / 60), m = ((start % 60) + 60) % 60;
  const clock = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { total, start: clock };
}

export const reasonLine = (p, n = 2) => p.reasons.slice(0, n).map((r) => r.text).join(" · ").replace(/^\w/, (c) => c.toUpperCase());
