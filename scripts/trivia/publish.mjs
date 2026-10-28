#!/usr/bin/env node
// Turns the reviewed cards in scripts/trivia/review.json into the small file the app loads: src/trivia.json
//   { "<tmdb id>": { "u": "<wikipedia url>", "c": ["card text", ...] } }
// Cards with "ok": false are left out. Evidence quotes stay in review.json and never ship.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REVIEW = path.join(here, "review.json");
const OUT = path.join(here, "../../src/trivia.json");
const COLLECTION = path.join(here, "../../src/collection.json");

if (!fs.existsSync(REVIEW)) { console.error("No review.json yet. Run npm run trivia:build first."); process.exit(1); }
const review = JSON.parse(fs.readFileSync(REVIEW, "utf8"));

const out = {};
for (const id of Object.keys(review).sort((a, b) => Number(a) - Number(b))) {
  const r = review[id];
  const c = (r.cards || []).filter((x) => x.ok !== false).map((x) => x.text);
  if (c.length && r.wiki) out[id] = { u: r.wiki, c };
}
fs.writeFileSync(OUT, JSON.stringify(out));

const films = JSON.parse(fs.readFileSync(COLLECTION, "utf8")).filter((f) => f.tmdb && (f.tmdbType || "movie") === "movie");
const have = films.filter((f) => out[f.tmdb]);
const rich = have.filter((f) => out[f.tmdb].c.length >= 3);
const cards = Object.values(out).reduce((n, x) => n + x.c.length, 0);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${cards} cards across ${Object.keys(out).length} films.`);
console.log(`Of ${films.length} films on the shelf: ${have.length} have trivia, ${rich.length} have 3 or more, ${films.length - have.length} have none.`);
