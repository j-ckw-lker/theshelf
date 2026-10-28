// Pure helpers for the trivia pipeline (no network), so they can be tested on their own.

// Sections of a Wikipedia article that never hold behind-the-scenes material.
const SKIP = /^(plot|plot summary|synopsis|premise|cast|cast and characters|characters|voice cast|reception|critical (response|reception)|critical reaction|reviews|box office|accolades|awards|awards and nominations|references|external links|see also|notes|further reading|bibliography|sources|footnotes|citations|track listing|soundtrack track listing|in popular culture|cultural impact|legacy|sequel|sequels|home media|video games?|merchandise|novelization|comic book adaptation)$/i;

// Split plain-text Wikipedia (explaintext, exsectionformat=wiki) into sections.
export function splitSections(text) {
  const lines = String(text || "").split("\n");
  const out = [{ heading: "Lead", level: 1, body: [] }];
  for (const line of lines) {
    const m = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (m) out.push({ heading: m[2], level: m[1].length, body: [] });
    else out[out.length - 1].body.push(line);
  }
  return out.map((s) => ({ ...s, body: s.body.join("\n").trim() }));
}

// Keep everything except the skipped sections (and their subsections), capped at `cap` characters.
export function keepSections(text, cap = 14000) {
  const parts = [];
  let skipLevel = null;
  for (const s of splitSections(text)) {
    if (skipLevel != null && s.level > skipLevel) continue;
    skipLevel = null;
    if (s.heading !== "Lead" && SKIP.test(s.heading)) { skipLevel = s.level; continue; }
    if (!s.body) continue;
    parts.push(s.heading === "Lead" ? s.body : `## ${s.heading}\n${s.body}`);
  }
  let out = parts.join("\n\n");
  if (out.length > cap) {
    out = out.slice(0, cap);
    const cut = out.lastIndexOf("\n");
    if (cut > cap * 0.7) out = out.slice(0, cut);
  }
  return out;
}

// Normalise for comparing a quoted span against the source text.
export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

// Pull the JSON object out of a model reply that may have chatter around it.
export function parseJson(reply) {
  const s = String(reply || "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

const KINDS = new Set(["casting", "shoot", "stunts", "writing", "music", "effects", "release", "other"]);

// The guard against invented trivia: a card survives only if the model's quoted evidence
// really appears, word for word, in the article text it was given.
export function verifyCards(cards, sourceText) {
  const src = norm(sourceText);
  const kept = [];
  const dropped = [];
  const seen = new Set();
  for (const c of Array.isArray(cards) ? cards : []) {
    const text = String(c?.text || "").replace(/\s+/g, " ").trim();
    const evidence = String(c?.evidence || "").replace(/\s+/g, " ").trim();
    const why =
      text.length < 25 || text.length > 260 ? "bad length"
      : evidence.length < 30 ? "evidence too short"
      : !src.includes(norm(evidence)) ? "evidence not in source"
      : seen.has(norm(text)) ? "duplicate"
      : null;
    if (why) { dropped.push({ text, why }); continue; }
    seen.add(norm(text));
    kept.push({ text, kind: KINDS.has(c.kind) ? c.kind : "other", evidence });
  }
  return { kept, dropped };
}

// Wikipedia's lead should mention the film's year (±1 for festival/release gaps). Used only for
// title-search fallbacks, never for matches that came from Wikidata's TMDB ID.
export function looksLikeFilm(text, year) {
  const lead = String(text || "").slice(0, 1800);
  const y = Number(year);
  return /film|movie/i.test(lead) && [y - 1, y, y + 1].some((n) => lead.includes(String(n)));
}

export function buildPrompt(name, year, text) {
  return `You write trivia cards for a film obsessive's personal collection app. Below is text from the Wikipedia article for "${name}" (${year}).

Extract 3 to 8 behind-the-scenes facts from it.

Rules:
- Use ONLY what the text states. No outside knowledge, no guessing, no filling gaps.
- Each card must make sense on its own and name the people involved (never just "he" or "the actor").
- Max 220 characters per card, plain sentences, no markdown.
- Prefer surprising specifics: casting changes, injuries, stunts, accidents, locations, cut material, rights and music problems, script origins, what got reshot, budget stories. Skip bare credits, release dates, box office, awards and critic opinion.
- Cards must not repeat each other.
- "evidence" must be the shortest span (40 to 250 characters) copied EXACTLY, character for character, from the text above that supports the card.
- If fewer than 3 solid facts exist, return fewer. If none, return {"cards":[]}.

Reply with ONLY JSON in this shape:
{"cards":[{"text":"...","kind":"casting|shoot|stunts|writing|music|effects|release|other","evidence":"..."}]}

ARTICLE TEXT:
${text}`;
}
