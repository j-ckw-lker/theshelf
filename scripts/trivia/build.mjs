#!/usr/bin/env node
// Builds trivia fact cards for the films in src/collection.json.
//
//   ANTHROPIC_API_KEY=sk-ant-... npm run trivia:build
//
// Flags:
//   --limit N        only process N films this run
//   --only "title"   only films whose name contains this (case-insensitive)
//   --force          redo films that already have cards
//   --dry            fetch and trim the Wikipedia text, skip the model call, print what it found
//
// Needs Node 18+ and a normal internet connection (Wikipedia, Wikidata, api.anthropic.com).
// Output goes to scripts/trivia/review.json. Skim it, set "ok": false on any card you don't
// want, then run `npm run trivia:publish` to rebuild src/trivia.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keepSections, norm, parseJson, verifyCards, looksLikeFilm, buildPrompt } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const COLLECTION = path.join(here, "../../src/collection.json");
const REVIEW = path.join(here, "review.json");
const CACHE = path.join(here, "cache");
const UA = "TheShelf/1.0 (personal film collection app; github.com/j-ckw-lker/theshelf)";
const MODEL = process.env.TRIVIA_MODEL || "claude-sonnet-5-5";
const KEY = process.env.ANTHROPIC_API_KEY;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const val = (n) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : null; };
const DRY = flag("dry");
const FORCE = flag("force");
const LIMIT = val("limit") ? Number(val("limit")) : Infinity;
const ONLY = val("only") ? val("only").toLowerCase() : null;

if (!DRY && !KEY) { console.error("Set ANTHROPIC_API_KEY first (or pass --dry to just test the Wikipedia side)."); process.exit(1); }
if (Number(process.versions.node.split(".")[0]) < 18) { console.error("Needs Node 18 or newer."); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "user-agent": UA, accept: "application/json", ...(opts.headers || {}) } });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 90)}`);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

// TMDB id -> English Wikipedia title, via Wikidata's "TMDb movie ID" property (P4947). Exact, no guessing.
async function titlesFromWikidata(films) {
  const out = new Map();
  for (let i = 0; i < films.length; i += 80) {
    const ids = films.slice(i, i + 80).map((f) => `"${f.tmdb}"`).join(" ");
    const q = `SELECT ?tmdb ?title WHERE { VALUES ?tmdb { ${ids} } ?item wdt:P4947 ?tmdb . ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }`;
    try {
      const j = await getJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
      for (const b of j.results.bindings) out.set(String(b.tmdb.value), b.title.value);
    } catch (e) { console.warn("  Wikidata batch failed:", e.message); }
    await sleep(400);
  }
  return out;
}

async function searchTitle(f) {
  const q = `${f.name} ${f.year} film`;
  const j = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&formatversion=2&srsearch=${encodeURIComponent(q)}`);
  return j.query?.search?.map((s) => s.title) || [];
}

async function fetchArticle(title) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, title.replace(/[^\w.-]+/g, "_").slice(0, 120) + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const j = await getJson(
    "https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&explaintext=1&exsectionformat=wiki&redirects=1&inprop=url&format=json&formatversion=2&titles=" + encodeURIComponent(title)
  );
  const p = j.query?.pages?.[0];
  if (!p || p.missing || !p.extract) return null;
  const art = { title: p.title, url: p.fullurl, text: p.extract };
  fs.writeFileSync(file, JSON.stringify(art));
  return art;
}

async function ask(prompt) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1800, messages: [{ role: "user", content: prompt }] }),
    });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return j.content?.map((c) => c.text || "").join("") || "";
  }
  throw new Error("Anthropic kept failing");
}

const review = fs.existsSync(REVIEW) ? JSON.parse(fs.readFileSync(REVIEW, "utf8")) : {};
const save = () => { fs.writeFileSync(REVIEW + ".tmp", JSON.stringify(review, null, 1)); fs.renameSync(REVIEW + ".tmp", REVIEW); };

const all = JSON.parse(fs.readFileSync(COLLECTION, "utf8")).filter((f) => f.tmdb && (f.tmdbType || "movie") === "movie");
let todo = all.filter((f) => (!ONLY || f.name.toLowerCase().includes(ONLY)) && (FORCE || !review[f.tmdb] || review[f.tmdb].seed));
todo = todo.slice(0, LIMIT);
console.log(`${all.length} films in the collection, ${todo.length} to do${DRY ? " (dry run)" : ""}.`);
if (!todo.length) process.exit(0);

console.log("Looking up Wikipedia pages through Wikidata...");
const titles = await titlesFromWikidata(todo);
console.log(`  ${titles.size} matched by TMDB id.`);

let done = 0, withCards = 0;
async function work(f) {
  const tag = `${f.name} (${f.year})`;
  try {
    let art = null;
    const t = titles.get(String(f.tmdb));
    if (t) art = await fetchArticle(t);
    if (!art) {
      for (const cand of await searchTitle(f)) {
        const a = await fetchArticle(cand);
        if (a && looksLikeFilm(a.text, f.year)) { art = a; break; }
        await sleep(150);
      }
    }
    if (!art) { review[f.tmdb] = { name: f.name, year: f.year, built: new Date().toISOString().slice(0, 10), note: "no wikipedia article found", cards: [] }; return console.log(`  - ${tag}: no article`); }

    const text = keepSections(art.text);
    if (text.length < 700) { review[f.tmdb] = { name: f.name, year: f.year, wiki: art.url, built: new Date().toISOString().slice(0, 10), note: "article too thin", cards: [] }; return console.log(`  - ${tag}: thin (${text.length} chars)`); }
    if (DRY) return console.log(`  ✓ ${tag}: ${art.title}, ${text.length} chars of usable text`);

    const reply = await ask(buildPrompt(f.name, f.year, text));
    const parsed = parseJson(reply);
    if (!parsed) { console.log(`  ! ${tag}: model reply wasn't JSON, will retry next run`); return; }
    const { kept, dropped } = verifyCards(parsed.cards, text);
    review[f.tmdb] = {
      name: f.name, year: f.year, wiki: art.url, built: new Date().toISOString().slice(0, 10),
      cards: kept.map((c, i) => ({ id: `${f.tmdb}-${i + 1}`, ...c, ok: true })),
    };
    if (kept.length) withCards++;
    console.log(`  ✓ ${tag}: ${kept.length} cards${dropped.length ? `, ${dropped.length} dropped (${dropped.map((d) => d.why).join("; ")})` : ""}`);
  } catch (e) {
    console.log(`  ! ${tag}: ${e.message}`);
  } finally {
    done++;
    if (!DRY && done % 5 === 0) save();
  }
}

// Three at a time keeps Wikipedia and the API happy.
const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await work(queue.shift()); }));
if (!DRY) save();
console.log(`\nDone. ${withCards} of ${todo.length} films got cards. Review: ${path.relative(process.cwd(), REVIEW)}`);
if (!DRY) console.log("Next: skim review.json (set \"ok\": false on anything you don't like), then npm run trivia:publish");
