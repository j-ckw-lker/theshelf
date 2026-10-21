// Streaming partners: films you don't own that pair well with a given film and are playing on a service right now.
//
// Candidates come from TMDB's discover search (same director, cinematographer, composer, stars, or a rare shared
// keyword), narrowed to what's streaming in your region on the services you picked. The pair scorer from pairs.js
// then ranks them the way it ranks films on your shelf, so the reasons read the same.
// Streaming availability is TMDB's watch-provider data, which comes from JustWatch.

import { readJSON, store, shapeTmdbMovie, todayISO } from "./lib.js";
import { scorePair } from "./pairs.js";

export const REGION = "US";
// "Streaming" = a subscription service or free with ads. Rentals and purchases don't count.
const MONETIZATION = "flatrate|free|ads";
const KINDS = ["flatrate", "free", "ads"];
const KIND_LABEL = { flatrate: "", free: "free", ads: "free with ads" };
const DETAIL_CAP = 16; // candidates that get a full look (credits and keywords)
const SHOW_CAP = 8;    // pairs that come back
const MIN_SCORE = 2.5; // below this a pair is shared genre and little else
const STREAM_TTL = 12 * 36e5;
const PROVIDER_TTL = 14 * 864e5;

// Run async jobs a few at a time.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// A TMDB movie shaped like a shelf film, enough for the pair scorer and the cards.
export function likeFromTmdb(d) {
  const s = shapeTmdbMovie(d);
  const year = (d.release_date || "").slice(0, 4);
  return {
    key: "tmdb:" + d.id, tmdb: d.id, name: d.title || d.original_title || "Untitled", year, yearNum: parseInt(year) || 0,
    runtime: s.runtime, genres: s.genres || [], directors: s.directors || [], dop: s.dop || [], music: s.music || [],
    cast: s.cast || [], keywords: s.keywords || [], countries: s.countries || [], collection: s.collection,
    posterPath: s.poster || null, tags: [],
  };
}

// One film as the anchor: shaped like a shelf film, plus the TMDB ids that discover searches are built from.
export async function loadAnchor(tmdb, id) {
  const d = await tmdb(`/movie/${id}`, { append_to_response: "credits,keywords", language: "en-US" });
  const crew = d.credits?.crew || [];
  const people = (...jobs) => [...new Set(crew.filter((c) => jobs.includes(c.job)).map((c) => c.id))];
  return {
    like: likeFromTmdb(d),
    ids: {
      directors: people("Director").slice(0, 2),
      dop: people("Director of Photography").slice(0, 1),
      music: people("Original Music Composer", "Music").slice(0, 1),
      cast: (d.credits?.cast || []).slice(0, 2).map((c) => c.id),
      keywords: (d.keywords?.keywords || []).map((k) => ({ id: k.id, name: k.name })),
    },
  };
}

// Which services a film streams on in your region, "free" and "with ads" kept apart, your own services first.
async function whereStreaming(tmdb, id, services) {
  const j = await tmdb(`/movie/${id}/watch/providers`);
  const r = j.results?.[REGION];
  if (!r) return null;
  const mine = new Set(services);
  const seen = new Set();
  const on = [];
  KINDS.forEach((kind) => (r[kind] || []).forEach((p) => {
    if (seen.has(p.provider_id)) return;
    seen.add(p.provider_id);
    on.push({ id: p.provider_id, name: p.provider_name, kind, mine: mine.has(p.provider_id) });
  }));
  if (!on.length) return null;
  // With services picked, only those count as "where": a pick that streams somewhere you don't subscribe is no pick.
  const usable = mine.size ? on.filter((p) => p.mine) : on;
  usable.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  return usable.length ? { on: usable, link: r.link || null } : null;
}

const cacheKey = (id, services) => id + "|" + services.slice().sort((a, b) => a - b).join(",");
const readCache = () => readJSON("shelf-stream-v1", {});
function cachePut(key, value) {
  const c = readCache();
  const now = Date.now();
  Object.keys(c).forEach((k) => { if (now - c[k].at > STREAM_TTL) delete c[k]; }); // keep it small
  c[key] = { at: now, ...value };
  store.set("shelf-stream-v1", JSON.stringify(c));
}

// What's already on this device for a film and service list, or null. Lets a screen show finished results without a fetch.
export function peekStreaming(anchorId, services = []) {
  const hit = readCache()[cacheKey(anchorId, services)];
  return hit && Date.now() - hit.at < STREAM_TTL ? { anchor: hit.anchor, items: hit.items } : null;
}

// Best streaming partners for one film. `owned` is the set of TMDB ids already on your shelf; those never come back
// (the shelf's own partners cover them). Resolves to [{ key, a, b, score, reasons, stream: {on, link}, ext: true }].
export async function streamingPartners({ tmdb, ix, anchorId, owned = new Set(), services = [], fresh = false }) {
  const ck = cacheKey(anchorId, services);
  if (!fresh) {
    const hit = readCache()[ck];
    if (hit && Date.now() - hit.at < STREAM_TTL) return { anchor: hit.anchor, items: hit.items };
  }
  const { like: anchor, ids } = await loadAnchor(tmdb, anchorId);

  const base = {
    watch_region: REGION, with_watch_monetization_types: MONETIZATION, sort_by: "vote_count.desc", "vote_count.gte": 40,
    "with_runtime.gte": 60, include_adult: "false", language: "en-US", "primary_release_date.lte": todayISO(),
  };
  if (services.length) base.with_watch_providers = services.join("|");

  // The three rarest keywords on the shelf's measure, each its own search so one vague keyword can't drown the rest.
  const kws = ids.keywords
    .map((k) => ({ ...k, w: ix.idfExt(k.name) }))
    .filter((k) => k.w > 0).sort((a, b) => b.w - a.w).slice(0, 3);
  const searches = [
    ...ids.directors.map((id) => ({ with_crew: id })),
    ...ids.dop.map((id) => ({ with_crew: id })),
    ...ids.music.map((id) => ({ with_crew: id })),
    ...(ids.cast.length ? [{ with_cast: ids.cast.join("|") }] : []),
    ...kws.map((k) => ({ with_keywords: k.id })),
  ];
  const found = await Promise.all(searches.map((s) => tmdb("/discover/movie", { ...base, ...s }).then((j) => j.results || []).catch(() => null)));
  if (searches.length && found.every((r) => r === null)) throw new Error("Couldn't reach TMDB.");

  // One entry per film; a film that turns up in several searches has more going for it.
  const cands = new Map();
  found.forEach((list) => (list || []).forEach((m) => {
    if (m.id === anchorId || owned.has(m.id)) return;
    const c = cands.get(m.id) || { id: m.id, hits: 0, votes: m.vote_count || 0 };
    c.hits++;
    cands.set(m.id, c);
  }));
  const top = [...cands.values()].sort((a, b) => b.hits - a.hits || b.votes - a.votes).slice(0, DETAIL_CAP);

  const looked = await pool(top, 6, (c) => tmdb(`/movie/${c.id}`, { append_to_response: "credits,keywords", language: "en-US" }).then(likeFromTmdb).catch(() => null));
  const scored = looked.filter(Boolean)
    .map((film) => ({ film, p: scorePair(ix, anchor, film, "build") }))
    .filter((x) => x.p && x.p.score >= MIN_SCORE)
    .sort((x, y) => y.p.score - x.p.score)
    .slice(0, SHOW_CAP);

  // Confirm where each one plays, and drop any that don't actually stream on your services.
  const where = await pool(scored, 6, (x) => whereStreaming(tmdb, x.film.tmdb, services).catch(() => null));
  const items = scored.map((x, i) => (where[i] ? {
    key: x.p.key, a: x.p.a, b: x.p.b, score: x.p.score, reasons: x.p.reasons, stream: where[i], ext: true,
    // Which side is the outsider, whichever order the years put them in.
    outsider: x.film.key,
  } : null)).filter(Boolean);

  cachePut(ck, { anchor, items });
  return { anchor, items };
}

// "Max · Tubi (free)" for a pair card.
export const streamLine = (stream) => (stream?.on || []).slice(0, 3).map((p) => p.name + (KIND_LABEL[p.kind] ? " (" + KIND_LABEL[p.kind] + ")" : "")).join(" · ");

// Every service TMDB lists for the region, the prominent ones first. Kept for two weeks.
export async function loadProviders(tmdb) {
  const c = readJSON("shelf-providers", null);
  if (c && c.region === REGION && Date.now() - c.at < PROVIDER_TTL && c.list?.length) return c.list;
  const j = await tmdb("/watch/providers/movie", { watch_region: REGION, language: "en-US" });
  const rank = (p) => p.display_priorities?.[REGION] ?? p.display_priority ?? 999;
  const list = (j.results || []).slice().sort((a, b) => rank(a) - rank(b)).slice(0, 80)
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path || null }));
  store.set("shelf-providers", JSON.stringify({ region: REGION, at: Date.now(), list }));
  return list;
}
