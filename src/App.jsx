import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, memo } from "react";
import SEED_COLLECTION from "./collection.json";
import COLLECTIONS from "./collections.json";
import META from "./meta.json";
import { SEED_WANTLIST } from "./wantlist.js";
import { IMPORTED_WANTS, IMPORT_ID, IMPORT2_ID, IMPORT2_ADD, IMPORT2_PATCH } from "./imports.js";
import {
  store, readJSON, fkey, img, tmdb, shapeTmdbMovie, todayISO, thisYear, fmtDate, runtimeLabel, stars,
  sortKey, letterOf, peopleLabel, hashStr, rng, shuffled, yearsSince, parseEdition, copyBadges, copyLine, money,
  FORMATS, PACKAGES, pkgsOf, REGIONS, KNOWN_LABELS, canonicalLabel, newId, isDigital, CODE_QUALITIES,
} from "./lib.js";
import { TAGS, THEMES, makeFilters, filterTest, activeFilterLabels, buildRecipes, dealShelves } from "./shelves.js";
import { pairIndex, bestPairs, partnersFor, scorePair, nightPlan, reasonLine } from "./pairs.js";
import { flushSync, createPortal } from "react-dom";
import "./styles.css";

// ════════════════════════════════════════════════════════════════════════
//  THE SHELF — j_ck's physical collection. "Archive" design.
//  Film data and images from TMDB (proxied through /api/tmdb).
// ════════════════════════════════════════════════════════════════════════

// ─── STORED DATA ────────────────────────────────────────────────────────
// A callback whose identity never changes but always runs the latest code, so memoized tabs
// don't re-render just because the parent made a new function.
function useEvent(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

// Preferences: one value per key in localStorage, shared live between every component that reads it.
const PREF_EVENT = "shelf-pref";
const getPref = (key, def) => { const v = store.get(key); return v == null || v === "" ? def : typeof def === "number" ? (Number.isFinite(+v) ? +v : def) : typeof def === "boolean" ? v === "1" : v; };
const setPrefValue = (key, v) => { store.set(key, typeof v === "boolean" ? (v ? "1" : "0") : String(v)); window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: key })); };
function usePref(key, def) {
  const [v, setV] = useState(() => getPref(key, def));
  useEffect(() => {
    const on = (e) => { if (e.detail === key) setV(getPref(key, def)); };
    window.addEventListener(PREF_EVENT, on);
    return () => window.removeEventListener(PREF_EVENT, on);
  }, [key]);
  return [v, useCallback((n) => setPrefValue(key, n), [key])];
}

function useStored(key, initial) {
  const [value, setValue] = useState(() => readJSON(key, typeof initial === "function" ? initial() : initial));
  const save = useCallback((next) => {
    setValue((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      store.set(key, JSON.stringify(v));
      return v;
    });
  }, [key]);
  return [value, save];
}

// RFC 4180-ish CSV: quoted fields, doubled quotes, commas and newlines inside quotes.
function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const wantId = (w) => w.film + "|" + (w.year || "");

// Watch log: per film, a list of { date, rating? }. Older saves stored a single date string.
const entriesOf = (v) => (Array.isArray(v) ? v : v ? [{ date: v }] : []);

function useData() {
  const [userData, setUserData] = useStored("shelf-userdata", {});
  const [added, setAdded] = useStored("shelf-added", []);
  const [want, setWant] = useStored("shelf-want", () => SEED_WANTLIST.map((w) => ({ ...w, bought: false })));
  const [watchLog, setWatchLog] = useStored("shelf-watchlog", {});
  const [customTags, setCustomTags] = useStored("shelf-customtags", []);
  const [programs, setPrograms] = useStored("shelf-programs", []);
  const [labels, setLabels] = useStored("shelf-labels", []); // labels you've typed, offered as chips from then on
  // On deck: a short running pool of films you might watch this week. { key, added, tonight? }
  const [deck, setDeck] = useStored("shelf-deck", []);
  const retag = (fn) => setUserData((d) => Object.fromEntries(Object.entries(d).map(([k, u]) => [k, u.tags ? { ...u, tags: fn(u.tags) } : u])));
  return {
    userData, added, want, watchLog, customTags, programs, labels, deck,
    setDeck,
    toggleDeck: (k) => setDeck((d) => (d.some((x) => x.key === k) ? d.filter((x) => x.key !== k) : [...d, { key: k, added: todayISO() }])),
    removeDeck: (k) => setDeck((d) => d.filter((x) => x.key !== k)),
    keepDeck: (k) => setDeck((d) => d.map((x) => (x.key === k ? { ...x, added: todayISO() } : x))),
    // Only one film is "tonight" at a time; pinning another unpins the first.
    pinTonight: (k) => setDeck((d) => d.map((x) => {
      const { tonight, ...rest } = x;
      return x.key === k ? { ...rest, tonight: todayISO() } : rest;
    })),
    addLabel: (name) => setLabels((l) => (l.includes(name) ? l : [...l, name])),
    removeLabel: (name) => setLabels((l) => l.filter((x) => x !== name)),
    // Letterboxd diary import: { filmKey: [{date, rating}] }. Anything already logged here wins on the same date.
    importDiary: (byKey) => setWatchLog((w) => {
      const next = { ...w };
      Object.entries(byKey).forEach(([k, list]) => {
        next[k] = unionBy(list, entriesOf(next[k]), (e) => e.date).sort((a, b) => a.date.localeCompare(b.date));
      });
      return next;
    }),
    saveProgram: (p) => setPrograms((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [{ ...p, created: todayISO() }, ...ps])),
    removeProgram: (id) => setPrograms((ps) => ps.filter((x) => x.id !== id)),
    addTag: (name) => setCustomTags((t) => (t.includes(name) || TAGS[name] ? t : [...t, name])),
    renameTag: (from, to) => {
      setCustomTags((t) => t.map((x) => (x === from ? to : x)).filter((x, i, a) => a.indexOf(x) === i));
      retag((tags) => [...new Set(tags.map((x) => (x === from ? to : x)))]);
    },
    removeTag: (name) => { setCustomTags((t) => t.filter((x) => x !== name)); retag((tags) => tags.filter((x) => x !== name)); },
    updateFilm: (k, u) => setUserData((d) => ({ ...d, [k]: { ...(d[k] || {}), ...u } })),
    addFilm: (f) => setAdded((a) => [...a, { addedAt: todayISO(), ...f, userAdded: true }]),
    patchAdded: (k, patch) => setAdded((a) => a.map((f) => (fkey(f) === k ? { ...f, ...patch } : f))),
    removeFilm: (k) => setAdded((a) => a.filter((f) => fkey(f) !== k)),
    logWatch: (k, date = todayISO(), rating) => {
      setWatchLog((w) => ({
        ...w,
        [k]: [...entriesOf(w[k]).filter((e) => e.date !== date), { date, ...(rating != null ? { rating } : {}) }].sort((a, b) => a.date.localeCompare(b.date)),
      }));
      // Watched it: it comes off deck (unless the watch you logged predates putting it there).
      setDeck((d) => (d.some((x) => x.key === k && date >= x.added) ? d.filter((x) => !(x.key === k && date >= x.added)) : d));
    },
    unlogWatch: (k, date) => setWatchLog((w) => {
      const left = date ? entriesOf(w[k]).filter((e) => e.date !== date) : [];
      const { [k]: _, ...rest } = w;
      return left.length ? { ...rest, [k]: left } : rest;
    }),
    setWant,
    addWant: (w) => setWant((ws) => (ws.some((x) => wantId(x) === wantId(w)) ? ws : [{ added: todayISO(), bought: false, kind: "new", ...w }, ...ws])),
    updateWant: (id, patch) => setWant((ws) => ws.map((x) => (wantId(x) === id ? { ...x, ...patch } : x))),
    removeWant: (id) => setWant((ws) => ws.filter((x) => wantId(x) !== id)),
    // Merge an outside list (Orbit, Amazon): new titles go on top, existing ones only gain the fields they lack.
    importWants: (list, { addNew = true } = {}) => setWant((ws) => {
      const k = (w) => wantId(w).toLowerCase();
      const incoming = new Map(list.map((w) => [k(w), w]));
      const have = new Set(ws.map(k));
      const merged = ws.map((x) => {
        const imp = incoming.get(k(x));
        return imp ? { ...imp, ...Object.fromEntries(Object.entries(x).filter(([, v]) => v !== "" && v != null)) } : x;
      });
      return addNew ? [...list.filter((w) => !have.has(k(w))), ...merged] : merged;
    }),
    importAll: (p) => {
      if (p.userData) setUserData(p.userData);
      if (p.added) setAdded(p.added);
      if (p.want) setWant(p.want);
      if (p.watchLog) setWatchLog(p.watchLog);
      if (p.customTags) setCustomTags(p.customTags);
      if (p.programs) setPrograms(p.programs);
      if (p.labels) setLabels(p.labels);
      if (p.deck) setDeck(p.deck);
    },
    exportPayload: () => ({ userData, added, want, watchLog, customTags, programs, labels, deck }),
  };
}

// ─── SYNC ───────────────────────────────────────────────────────────────
// Keeps a copy of everything personal on the server (api/sync.js), locked with a passphrase:
// saves a moment after each change, checks for newer copies when the app opens or comes back,
// and merges when two devices both changed things. A new install just enters the passphrase.
const SYNC_FIELDS = ["userData", "added", "want", "watchLog", "customTags", "programs", "labels", "deck"];
const hasPersonal = (d) => !!(Object.keys(d.userData || {}).length || (d.added || []).length || Object.keys(d.watchLog || {}).length
  || (d.customTags || []).length || (d.programs || []).length || (d.labels || []).length);
const unionBy = (a = [], b = [], key) => { const m = new Map(); a.forEach((x) => m.set(key(x), x)); b.forEach((x) => m.set(key(x), x)); return [...m.values()]; };
// Combine two copies; where both have the same thing, the second (this device) wins.
function mergeDocs(server = {}, local = {}) {
  const userData = { ...(server.userData || {}) };
  Object.entries(local.userData || {}).forEach(([k, u]) => { userData[k] = { ...(userData[k] || {}), ...u }; });
  const watchLog = { ...(server.watchLog || {}) };
  Object.entries(local.watchLog || {}).forEach(([k, v]) => {
    watchLog[k] = unionBy(entriesOf(watchLog[k]), entriesOf(v), (e) => e.date).sort((a, b) => a.date.localeCompare(b.date));
  });
  return {
    userData, watchLog,
    added: unionBy(server.added, local.added, fkey),
    customTags: [...new Set([...(server.customTags || []), ...(local.customTags || [])])],
    programs: unionBy(server.programs, local.programs, (p) => p.id),
    want: unionBy(server.want, local.want, (w) => w.film + "|" + w.year),
    labels: [...new Set([...(server.labels || []), ...(local.labels || [])])],
    deck: unionBy(server.deck, local.deck, (d) => d.key),
  };
}

function useSync(D) {
  const payload = useMemo(() => Object.fromEntries(SYNC_FIELDS.map((k) => [k, D[k]])), SYNC_FIELDS.map((k) => D[k]));
  const json = useMemo(() => JSON.stringify(payload), [payload]);
  const payloadRef = useRef(payload); payloadRef.current = payload;
  const jsonRef = useRef(json); jsonRef.current = json;
  const [pass, setPass] = useState(() => store.get("shelf-sync-pass") || "");
  const [status, setStatus] = useState(() => ({ state: store.get("shelf-sync-pass") ? "idle" : "off", at: readJSON("shelf-sync-meta", {}).at || null }));
  const meta = useRef(readJSON("shelf-sync-meta", { version: null, at: null, synced: null }));
  const saveMeta = (m) => { meta.current = { ...meta.current, ...m }; store.set("shelf-sync-meta", JSON.stringify(meta.current)); };
  const adoptNext = useRef(false);   // the next local change came from the server: remember it as synced, don't send it back
  const choosing = useRef(null);     // first connect found data both here and in the cloud: wait for a decision
  const busy = useRef(false);
  const device = useMemo(() => { let d = store.get("shelf-device"); if (!d) { d = newId(); store.set("shelf-device", d); } return d; }, []);

  const api = async (method, body, p = pass) => {
    const r = await fetch("/api/sync", { method, headers: { "x-shelf-pass": p, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) return { conflict: j.doc };
    if (!r.ok) throw new Error(j.error || "Couldn't reach sync (" + r.status + ").");
    return j;
  };
  const adopt = (data, extra) => { adoptNext.current = true; D.importAll(data); saveMeta(extra); };

  const push = async () => {
    if (!pass || busy.current || choosing.current) return;
    busy.current = true; setStatus((s) => ({ ...s, state: "syncing" }));
    const sentJson = jsonRef.current;
    try {
      let r = await api("PUT", { data: payloadRef.current, base: meta.current.version, device });
      if (r.conflict) {
        // Another device saved first: fold its changes in, then save the combined copy.
        const merged = mergeDocs(r.conflict.data, payloadRef.current);
        r = await api("PUT", { data: merged, base: r.conflict.version, device });
        if (r.conflict) throw new Error("Changes are arriving from another device. Tap Sync now.");
        adopt(merged, { version: r.version, at: r.updatedAt });
      } else saveMeta({ version: r.version, at: r.updatedAt, synced: sentJson });
      setStatus({ state: "ok", at: r.updatedAt, checked: Date.now() });
    } catch (e) { setStatus((s) => ({ ...s, state: "error", error: e.message })); }
    busy.current = false;
  };

  const pull = async () => {
    if (!pass || busy.current || choosing.current) return;
    busy.current = true; setStatus((s) => ({ ...s, state: "syncing" }));
    try {
      const { doc } = await api("GET");
      busy.current = false;
      if (!doc) { if (hasPersonal(payloadRef.current)) { saveMeta({ version: null, synced: null }); return push(); } return setStatus({ state: "ok", at: Date.now(), checked: Date.now() }); }
      if (doc.version !== meta.current.version) {
        const dirty = jsonRef.current !== meta.current.synced;
        if (!dirty) adopt(doc.data, { version: doc.version, at: doc.updatedAt });
        else { D.importAll(mergeDocs(doc.data, payloadRef.current)); saveMeta({ version: doc.version }); } // the change effect saves the merge
      }
      setStatus({ state: "ok", at: doc.updatedAt, checked: Date.now() });
    } catch (e) { busy.current = false; setStatus((s) => ({ ...s, state: "error", error: e.message })); }
  };

  // Save a moment after each change.
  useEffect(() => {
    if (!pass) return;
    if (adoptNext.current) { adoptNext.current = false; saveMeta({ synced: json }); return; }
    if (json === meta.current.synced || choosing.current) return;
    const t = setTimeout(push, 1500);
    return () => clearTimeout(t);
  }, [json, pass]);

  // Check for a newer copy on launch and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!pass) return;
    pull();
    const onVis = () => document.visibilityState === "visible" && pull();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pass]);

  const connect = async (p) => {
    setStatus({ state: "syncing" });
    try {
      const { doc } = await api("GET", null, p);
      store.set("shelf-sync-pass", p);
      if (!doc) { saveMeta({ version: null, synced: null }); setPass(p); return; }               // empty cloud: this phone uploads
      if (!hasPersonal(payloadRef.current)) { adopt(doc.data, { version: doc.version, at: doc.updatedAt }); setPass(p); setStatus({ state: "ok", at: doc.updatedAt, restored: true }); return; }
      choosing.current = doc; setPass(p); setStatus({ state: "choose", doc });                  // both have data: ask
    } catch (e) { setStatus({ state: "off", error: e.message }); }
  };
  const choose = (mode) => {
    const doc = choosing.current; choosing.current = null;
    if (!doc) return;
    if (mode === "cloud") { adopt(doc.data, { version: doc.version, at: doc.updatedAt }); setStatus({ state: "ok", at: doc.updatedAt }); return; }
    if (mode === "merge") D.importAll(mergeDocs(doc.data, payloadRef.current));
    saveMeta({ version: doc.version, synced: null });
    setStatus({ state: "syncing" });
    setTimeout(push, 50);
  };
  const disconnect = () => {
    store.set("shelf-sync-pass", ""); store.set("shelf-sync-meta", "");
    meta.current = { version: null, at: null, synced: null }; choosing.current = null;
    setPass(""); setStatus({ state: "off" });
  };
  return { on: !!pass, status, connect, choose, disconnect, syncNow: () => (jsonRef.current !== meta.current.synced ? push() : pull()) };
}

function deriveFilm(raw, userData, watchLog, hiddenTags = []) {
  const key = fkey(raw);
  const u = userData[key] || {};
  const f = u.match ? { ...raw, ...u.match } : raw; // "Fix the match" swaps in another film's TMDB data
  const copies = (u.copies || parseEdition(f.edition || "").map((c, i) => ({ ...c, id: "s" + i })))
    .map((c) => (c.label ? { ...c, label: canonicalLabel(c.label) } : c));
  const diary = entriesOf(watchLog[key]);
  const logged = diary.length ? diary[diary.length - 1].date : null;
  const views = f.views ? f.views.slice() : [];
  diary.forEach((e) => { if (!views.includes(e.date)) views.push(e.date); });
  views.sort();
  const lastWatched = [logged, f.lastWatched, views[views.length - 1]].filter(Boolean).sort().pop() || null;
  const sk = sortKey(f.name);
  const out = {
    ...f,
    key,
    // Built-in tags you've removed are invisible everywhere (shelves, filters, Sell hiding), but stay
    // stored so restoring the tag brings them back. Writes always go through rawTags.
    tags: (u.tags || []).filter((t) => !hiddenTags.includes(t)),
    rawTags: u.tags || [],
    note: u.note || "",
    customPoster: u.poster || null,
    backdrop: u.backdrop || f.backdrop || null,
    customBackdrop: u.backdrop || null,
    backdropPos: u.backdropPos || "center",
    posterPath: u.poster || f.poster || null,
    genres: f.genres || [], directors: f.directors || [], dop: f.dop || [], music: f.music || [],
    cast: f.cast || [], countries: f.countries || [], keywords: f.keywords || [],
    edition: f.edition || "",
    rating: u.rating !== undefined ? u.rating : f.rating,
    lbRating: f.rating,
    ratingSet: u.rating !== undefined,
    matched: !!u.match,
    copies,
    copiesSuggested: !u.copies && copies.length > 0,
    badges: copyBadges(copies),
    digitalOnly: copies.length > 0 && copies.every(isDigital),
    hasDigital: copies.some((c) => isDigital(c) || c.code),
    unredeemed: copies.some((c) => c.code && !c.codeRedeemed),
    // When it joined the shelf: earliest copy purchase date, else the day it was added here, else reconstructed history.
    addedOn: copies.map((c) => c.purchased).filter(Boolean).sort()[0] || f.addedAt || f.added || null,
    addedSince: f.addedSince || null,
    special: copies.some((c) => pkgsOf(c).length > 0 || c.label),
    views, lastWatched, diary,
    yearNum: parseInt(f.year) || 0,
    recency: f.userAdded ? 1e6 + (Date.parse(f.addedAt || "2026-10-11") / 864e5) : (f.added || 0),
    get addedKey() { return this.addedOn || this.addedSince || ""; },
    sortKey: sk, letter: letterOf(sk),
  };
  // Themes come from TMDB keywords, corrected by hand per film (themesAdd / themesOff).
  const plus = u.themesAdd || [], minus = u.themesOff || [];
  out.themesAdd = plus; out.themesOff = minus;
  out.themes = THEMES.filter(([id, , t]) => plus.includes(id) || (!minus.includes(id) && t(out))).map((x) => x[0]);
  return out;
}

// ─── ICONS ──────────────────────────────────────────────────────────────
const Icon = ({ d, size = 24, sw = 1.8, fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const I = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />,
  library: <path d="M5 3.5h4.5a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Zm9 2 4.3-1.2a1 1 0 0 1 1.2.7l3.7 13.6a1 1 0 0 1-.7 1.2l-4.3 1.2a1 1 0 0 1-1.2-.7L13.3 6.7a1 1 0 0 1 .7-1.2Z" />,
  stats: <path d="M4 20h16M6.5 20v-6M11 20V8M15.5 20v-9M20 20V5" />,
  backup: <path d="M4 13.5 6.2 5.6A1.5 1.5 0 0 1 7.6 4.5h8.8a1.5 1.5 0 0 1 1.4 1.1L20 13.5M4 13.5h4.5l1.2 2.5h4.6l1.2-2.5H20v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 5-7 7 7 7" />,
  chev: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M7 7l10 10M17 7 7 17" />,
  shuffle: <path d="M3 7h3.5c2.5 0 4 1.3 5.5 5s3 5 5.5 5H21M3 17h3.5c1.6 0 2.8-.6 3.8-1.8M13.7 8.8C14.7 7.6 15.9 7 17.5 7H21m-2.5-2.5L21 7l-2.5 2.5m0 5L21 17l-2.5 2.5" />,
  arrow: <path d="M12 5v14M6 13l6 6 6-6" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  heart: <path d="M12 20.3s-7.6-4.5-7.6-10.3A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.6 10c0 5.8-7.6 10.3-7.6 10.3Z" />,
  doubles: <><rect x="2.75" y="5" width="8.5" height="14" rx="1.5" /><rect x="12.75" y="5" width="8.5" height="14" rx="1.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" /></>,
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  wall: <><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="1" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="1" /><rect x="13" y="13" width="7.5" height="7.5" rx="1" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  you: <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.2-3.8 4-5.8 7.5-5.8s6.3 2 7.5 5.8" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0Z" /><circle cx="8" cy="8" r="1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5Z" />,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></>,
};

// ─── SHARED BITS ────────────────────────────────────────────────────────
function Poster({ path, title, size = "w342", className = "", eager = false, low }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setFailed(false); setReady(false); }, [path]);
  const src = img(path, size);
  return (
    <div className={"poster " + className}>
      {/* The smaller copy the grid already downloaded shows instantly; the sharp one fades in over it. */}
      {low && src && !failed && !ready && [].concat(low).map((sz) => <img key={sz} className="poster-low" src={img(path, sz)} alt="" decoding="sync" />)}
      {src && !failed
        ? <img src={src} alt="" loading={eager ? "eager" : "lazy"} decoding="async" onLoad={() => setReady(true)} onError={() => setFailed(true)} className={low ? "poster-hi" + (ready ? " on" : "") : undefined} />
        : <div className="poster-empty">{title}</div>}
    </div>
  );
}

// Start downloading a film's page art the moment a finger lands on it, before the tap even finishes.
const warmed = new Set();
const preloadFilm = (f) => {
  if (!f || warmed.has(f.key)) return;
  warmed.add(f.key);
  [f.posterPath && img(f.posterPath, "w342"), f.backdrop && img(f.backdrop, "w780")].filter(Boolean).forEach((u) => { const i = new Image(); i.decoding = "async"; i.src = u; });
};

// A banner that fades in when it arrives instead of popping.
function Banner({ path, pos }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(false), [path]);
  return <img src={img(path, "w780")} alt="" className={"banner-img" + (ready ? " on" : "")} onLoad={() => setReady(true)} style={{ objectPosition: "center " + pos }} />;
}

// ─── MOTION ─────────────────────────────────────────────────────────────
// Screen changes run through the View Transitions API where the browser has it (iOS 18+):
// the poster you tapped flies into the film page and back, tabs crossfade, the tab bar stays put.
// Older browsers and Reduce Motion just get the instant change (plus the CSS push on film pages).
const reduceMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
// Where view transitions run, they own the film-page entrance; the CSS slide-in is only a fallback.
// (Toggling it per transition replayed the slide-in the moment a transition ended: a visible jitter.)
if (typeof document !== "undefined" && document.startViewTransition && !reduceMotion()) document.documentElement.dataset.vtOn = "";
// Native-feeling navigation: tab switches, See all and filter changes are instant, the way iOS
// apps behave. Film pages animate with the push below instead. Add a kind here to animate it again.
const ANIMATED_KINDS = new Set();
function transition(kind, update, after) {
  if (!ANIMATED_KINDS.has(kind) || !document.startViewTransition || reduceMotion()) { update(); after?.(); return; }
  const root = document.documentElement;
  root.dataset.vt = kind;
  let t;
  try {
    t = document.startViewTransition(() => { flushSync(update); after?.(); });
  } catch { delete root.dataset.vt; update(); return; }
  t.finished.finally(() => { if (root.dataset.vt === kind) delete root.dataset.vt; });
  return t;
}
const posterFor = (key) => {
  const el = document.querySelector(`main:not([hidden]) [data-key="${CSS.escape(key)}"] .poster`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.width > 0 ? el : null;
};

// Change the Library's contents while keeping track of the posters on screen: each one glides to
// its new spot (or fades if it's no longer in view), and newly revealed posters fade in.
const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight; };
function reflow(update) {
  const named = [];
  const name = (el, n) => { if (el) { el.style.viewTransitionName = n; named.push(el); } };
  const clear = () => named.splice(0).forEach((el) => { el.style.viewTransitionName = ""; });
  const find = (k) => document.querySelector(`main:not([hidden]) [data-key="${CSS.escape(k)}"] .poster`);
  const keys = [...document.querySelectorAll("main:not([hidden]) [data-key]")].filter(onScreen).slice(0, 60).map((b) => b.dataset.key);
  // Anchor on the top-most film you could see: after the change, scroll so it sits exactly where it was.
  const anchorKey = keys.find((k) => find(k)?.getBoundingClientRect().top >= 0) || keys[0];
  const anchorTop = anchorKey ? find(anchorKey).getBoundingClientRect().top : 0;
  keys.forEach((k) => name(find(k), "r" + hashStr(k)));
  const t = transition("reflow", () => { clear(); update(); }, () => {
    const el = anchorKey && find(anchorKey);
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - anchorTop);
    keys.forEach((k) => name(posterFor(k), "r" + hashStr(k)));
  });
  if (t) t.finished.finally(clear); else clear();
}

function Sheet({ title, onClose, left, right, tall, children, foot, sub }) {
  const sheetRef = useRef(null);
  const [leaving, setLeaving] = useState(false);
  // Close with a slide down instead of vanishing.
  const close = useCallback(() => {
    if (reduceMotion()) return onClose();
    setLeaving(true);
    setTimeout(onClose, 270);
  }, [onClose]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  // Drag down to dismiss, from the header only (grabber and title bar). The body just scrolls,
  // so scrolling back up through a form can never close the sheet by accident. The sheet trails
  // your finger with some resistance and needs a real pull (or a hard flick) to let go.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    let y0 = 0, t0 = 0, dy = 0, raw = 0, mode = null;
    const start = (e) => {
      if (e.touches.length !== 1 || !e.target.closest(".sheet-head") || e.target.closest("button, input, .fjump")) { mode = "off"; return; }
      y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; raw = 0; mode = null;
    };
    const move = (e) => {
      if (mode === "off") return;
      const d = e.touches[0].clientY - y0;
      if (mode == null) { if (Math.abs(d) < 8) return; mode = d > 0 ? "drag" : "off"; if (mode === "off") return; }
      raw = Math.max(0, d);
      dy = raw * 0.75; // a little weight
      if (e.cancelable) e.preventDefault();
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (mode !== "drag") { mode = null; if (el.style.transform && !el.parentElement.classList.contains("leaving")) { el.style.transition = "transform 0.3s cubic-bezier(.2,.9,.3,1)"; el.style.transform = ""; } return; }
      mode = null;
      const fast = raw / Math.max(1, Date.now() - t0) > 1 && raw > 90;
      el.style.transition = "transform 0.3s cubic-bezier(.2,.9,.3,1)";
      if (raw > Math.max(170, el.offsetHeight * 0.33) || fast) {
        el.style.transform = "translateY(100%)";
        el.parentElement.classList.add("leaving");
        setTimeout(() => onCloseRef.current(), 260);
      } else el.style.transform = "";
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);
  // iOS hands a scroll to the whole screen whenever the sheet's list can't scroll any further that way
  // (already at the top, or too short to scroll at all), and the whole sheet slides down with your finger,
  // worst with the keyboard up. So inside a sheet, a vertical drag only ever scrolls the sheet's list: at
  // its ends, or anywhere outside it, the drag is swallowed. Sideways drags (chip rows) pass through.
  const scrimRef = useRef(null);
  useEffect(() => {
    const scrim = scrimRef.current;
    if (!scrim) return;
    let x = 0, y = 0, body = null, axis = null;
    const ts = (e) => {
      if (e.touches.length !== 1) return;
      x = e.touches[0].clientX; y = e.touches[0].clientY; axis = null;
      body = e.target.closest(".sheet-body");
    };
    const tm = (e) => {
      if (!e.cancelable || e.touches.length !== 1) return;
      const nx = e.touches[0].clientX, ny = e.touches[0].clientY;
      const dx = nx - x, dy = ny - y;
      if (axis == null && Math.abs(dx) + Math.abs(dy) > 4) axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      x = nx; y = ny;
      if (axis !== "y") return;
      if (e.target.closest(".sheet-head")) return; // the header's own drag-to-dismiss handles itself
      const ta = e.target.closest("textarea");
      if (ta && ta.scrollHeight > ta.clientHeight) return;
      if (!body) { e.preventDefault(); return; }
      const atTop = body.scrollTop <= 0;
      const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
      if ((dy > 0 && atTop) || (dy < 0 && atEnd)) e.preventDefault();
    };
    scrim.addEventListener("touchstart", ts, { passive: true });
    scrim.addEventListener("touchmove", tm, { passive: false });
    return () => { scrim.removeEventListener("touchstart", ts); scrim.removeEventListener("touchmove", tm); };
  }, []);
  // When the keyboard is up, iOS shrinks only the *visible* part of the screen and shoves the page up to
  // make room, which pushed the sheet's header off the top. Pin the sheet's backdrop to exactly the
  // visible area above the keyboard instead, so the whole sheet fits and nothing needs to move.
  useEffect(() => {
    const vv = window.visualViewport, scrim = scrimRef.current;
    if (!vv || !scrim) return;
    const fit = () => {
      const full = document.documentElement.clientHeight || window.innerHeight;
      const kb = full - vv.height > 80;
      scrim.classList.toggle("kb", kb);
      if (kb) {
        scrim.style.top = vv.offsetTop + "px";
        scrim.style.height = vv.height + "px";
        scrim.style.bottom = "auto";
        scrim.style.setProperty("--vvh", vv.height + "px");
      } else {
        scrim.style.top = scrim.style.height = scrim.style.bottom = "";
        scrim.style.removeProperty("--vvh");
      }
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); };
  }, []);
  // Rendered at the top of the page, so a sheet opened from inside a film page still covers the tab bar.
  return createPortal(
    <div ref={scrimRef} className={"scrim" + (leaving ? " leaving" : "")} onClick={close}>
      <div ref={sheetRef} className={"sheet" + (tall ? " tall" : "") + (leaving ? " leaving" : "")} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="grabber" />
          <div className="sheet-bar">
            <span>{left}</span>
            <h2>{title}</h2>
            <span style={{ justifySelf: "end" }}>{right || <button className="right" onClick={close}>Done</button>}</span>
          </div>
          {sub}
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>,
    document.body
  );
}

// Freeze the page behind overlays, and remember exactly where you were so closing the overlay
// puts you back (iOS can lose the position on its own). Counted, so a sheet over a film page
// doesn't unlock the page underneath. No position:fixed on body: in the home-screen app that
// shifts fixed elements and leaves a gap under the tab bar.
let locks = 0, lockedY = 0;
// Leaving for somewhere else (another tab) — land at the top instead of the old spot.
const forgetScroll = () => { lockedY = 0; };
const useBodyLock = (on) => useLayoutEffect(() => {
  if (!on) return;
  // The iOS keyboard can nudge the page while a field is focused; put it back when the field closes.
  const settle = () => setTimeout(() => { if (locks > 0 && Math.abs(window.scrollY - lockedY) > 1) window.scrollTo(0, lockedY); }, 60);
  document.addEventListener("focusout", settle);
  if (locks++ === 0) {
    lockedY = window.scrollY;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  return () => {
    document.removeEventListener("focusout", settle);
    if (--locks === 0) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      window.scrollTo(0, lockedY);
    }
  };
}, [on]);

// Floating "back to top" once you're a couple of screens down.
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > window.innerHeight * 1.5);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <button className={"to-top" + (show ? " on" : "")} aria-label="Back to top" aria-hidden={!show} tabIndex={show ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
      <Icon d={I.up} size={15} sw={2.6} />Top
    </button>
  );
}

// ─── HOME ───────────────────────────────────────────────────────────────
function useHomeState() {
  const [home, setHome] = useStored("shelf-home", { date: todayISO(), seed: 0, pick: 0 });
  useEffect(() => {
    const check = () => { if (home.date !== todayISO()) setHome({ date: todayISO(), seed: 0, pick: 0 }); };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [home.date, setHome]);
  return [home, setHome];
}

function pickFrom(list, date, n) {
  if (!list.length) return null;
  return list[Math.floor(rng(hashStr(date + ":pick") + n * 7919)() * list.length)];
}

function usePullToRefresh(onRefresh, enabled) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let startY = null, startX = 0, axis = null, pulling = false;
    const set = (v) => { pullRef.current = v; setPull(v); };
    const onStart = (e) => {
      if (busy.current || window.scrollY > 0 || document.body.style.overflow === "hidden") return;
      startY = e.touches[0].clientY; startX = e.touches[0].clientX; axis = null;
    };
    const onMove = (e) => {
      if (startY == null) return;
      // Lock the gesture's direction on its first few pixels: a sideways swipe through a shelf row
      // is never a pull, even if the finger drifts downward along the way.
      if (!axis) {
        const dx = Math.abs(e.touches[0].clientX - startX), dy = Math.abs(e.touches[0].clientY - startY);
        if (dx < 6 && dy < 6) return;
        axis = dx > dy ? "x" : "y";
        if (axis === "x") { startY = null; return; }
      }
      const d = e.touches[0].clientY - startY;
      if (d > 0 && window.scrollY <= 0) {
        pulling = true;
        set(Math.min(110, d * 0.5));
        if (e.cancelable) e.preventDefault();
      } else if (pulling) { pulling = false; set(0); }
    };
    const onEnd = () => {
      if (startY == null) return;
      startY = null;
      if (!pulling) return;
      pulling = false;
      if (pullRef.current >= 64) {
        busy.current = true; setRefreshing(true); set(56);
        setTimeout(() => { onRefresh(); busy.current = false; setRefreshing(false); set(0); }, 650);
      } else set(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onRefresh, enabled]);
  return { pull, refreshing, dragging: pull > 0 && !refreshing };
}

function Home({ films, defs, recipes, filters, home, setHome, onOpen, onSeeAll, onSearch, onFilters, onPair, onDoubles, saved = 0, active, deck = [], deckDays = 7, onDeckPin, onDeckRemove, onDeckPick, onDeckAll }) {
  const eligible = useMemo(() => films.filter(filterTest(defs, filters)), [films, defs, filters]);
  // A film pinned for tonight from On deck takes the hero; otherwise it's the day's pick.
  const tonight = deck.find((x) => x.tonight);
  const daily = pickFrom(eligible, home.date, home.pick);
  const pick = tonight ? tonight.f : daily;
  const extra = home.more || 0;
  const [deal] = usePref("shelf-deal-count", 6);
  // Double features are a fixture now (they used to have a tab): always the first shelf.
  const shelves = useMemo(() => {
    const seed = hashStr(home.date) + home.seed * 104729;
    const pairs = recipes.find((r) => r.kind === "pairs");
    const rest = dealShelves(recipes.filter((r) => r.kind !== "pairs"), seed, deal + extra * 3);
    return pairs ? [...dealShelves([pairs], seed, 1), ...rest] : rest;
  }, [recipes, home.date, home.seed, extra, deal]);
  const canDealMore = shelves.filter((s) => s.kind !== "pairs").length === deal + extra * 3 && recipes.length > shelves.length;
  const labels = activeFilterLabels(defs, filters);
  const filterLabel = labels.length === 0 ? "Filters" : labels.length === 1 ? labels[0] : labels[0] + " +" + (labels.length - 1);
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [pick && pick.key]);

  const another = () => {
    if (eligible.length < 2) return;
    let n = home.pick + 1;
    while (pickFrom(eligible, home.date, n) === pick && n < home.pick + 20) n++;
    setHome({ ...home, pick: n });
  };
  const refresh = useCallback(() => {
    setHome((h) => ({ ...h, seed: h.seed + 1, more: 0 }));
  }, [setHome]);
  const { pull, refreshing, dragging } = usePullToRefresh(refresh, active);

  return (
    <>
      <div className="ptr" aria-live="polite" style={{ opacity: refreshing ? 1 : Math.min(1, pull / 64) }}>
        <div className={"ptr-ring" + (refreshing ? " spinning" : "")}>
          <span style={{ display: "grid", transform: `rotate(${pull >= 64 && !refreshing ? 180 : 0}deg)` }}><Icon d={I.arrow} size={15} sw={2.6} /></span>
        </div>
        <span>{refreshing ? "Dealing a fresh shelf" : pull >= 64 ? "Release to refresh" : pull > 0 ? "Pull to refresh" : ""}</span>
      </div>

      <div style={{ transform: `translateY(${pull}px)`, transition: dragging ? "none" : "transform 0.3s cubic-bezier(.2,.9,.3,1)" }}>
        <div className="hero">
          <div className="hero-bg">
            {pick && pick.backdrop && (
              <img key={pick.backdrop} style={{ objectPosition: "center " + pick.backdropPos }} src={img(pick.backdrop, "w780")} srcSet={`${img(pick.backdrop, "w780")} 780w, ${img(pick.backdrop, "w1280")} 1280w`}
                sizes="(max-width: 560px) 100vw, 560px" alt="" />
            )}
          </div>
          <div className="hero-top">
            <span className="brand">The Shelf</span>
            <button className="icon-btn glass" onClick={onSearch} aria-label="Search the library"><Icon d={I.search} size={17} sw={2.2} /></button>
          </div>
          <div className="hero-bottom">
            {tonight && <span className="caps-badge solid">Tonight</span>}
            {pick ? (
              <button className="hero-title" onClick={() => onOpen(pick)} aria-label={"Open " + pick.name}>
                {pick.logo && !logoFailed
                  ? <img src={img(pick.logo, "w500")} alt={pick.name} onError={() => setLogoFailed(true)} />
                  : <span>{pick.name}</span>}
              </button>
            ) : (
              <span style={{ fontSize: 22, fontWeight: 700 }}>Nothing on the shelf fits every filter.</span>
            )}
          </div>
        </div>

        <div style={{ padding: "6px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>
          {pick ? (
            <>
              <div className="pick-meta tnum">
                <span>{pick.year}</span>
                {pick.runtime && <span>{runtimeLabel(pick.runtime)}</span>}
                {pick.directors.length > 0 && <span>{peopleLabel(pick.directors)}</span>}
                {pick.rating != null && <span className="accent">{stars(pick.rating)}</span>}
              </div>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={() => onOpen(pick)}>Details</button>
                {tonight
                  ? <button className="btn btn-outline" onClick={() => onDeckPin(tonight)}>Not tonight</button>
                  : <button className="btn btn-outline" onClick={another} disabled={eligible.length < 2}>Pick another</button>}
              </div>
            </>
          ) : (
            <div className="btn-row">
              <button className="btn btn-primary" onClick={onFilters}>Loosen filters</button>
              <button className="btn btn-outline" onClick={() => onFilters("reset")}>Reset all</button>
            </div>
          )}
          <div className="tonight-line">
            <span className="tnum">{eligible.length === 1 ? "1 film fits" : eligible.length + " films fit"}{labels.length ? "" : " tonight"}</span>
            <button className="filter-btn" onClick={onFilters}>{filterLabel}<Icon d={I.down} size={11} sw={2.8} /></button>
          </div>
        </div>

        <DeckShelf deck={deck} days={deckDays} onPin={onDeckPin} onRemove={onDeckRemove} onPick={onDeckPick} onSeeAll={onDeckAll} />

        <div className="deal-head">
          <span>Today's shelves</span>
          <button className="filter-btn" style={{ fontSize: 14 }} onClick={refresh}><Icon d={I.shuffle} size={15} sw={2.2} />Shuffle shelves</button>
        </div>
        {shelves.map((s) => (
          <section className="shelf" key={s.id} aria-label={s.title}>
            <div className="shelf-head">
              <div>
                <h2>{s.title}</h2>
                <p>{s.kind === "pairs" ? "Two films, one night" : `${s.films.length} ${s.kind === "person" ? "on your shelf" : "films"}`}</p>
              </div>
              <span className="shelf-links">
                {s.kind === "pairs" && saved > 0 && <button className="link" onClick={() => onDoubles("saved")}>Saved {saved}</button>}
                <button className="link" onClick={(e) => (s.kind === "pairs" ? onDoubles("feed") : onSeeAll(s, e.currentTarget))}>See all</button>
              </span>
            </div>
            {s.kind === "pairs" ? (
              <div className="shelf-row">
                {s.deal.map((p) => (
                  <button key={p.key} className="pair" onClick={() => onPair(p)} aria-label={`${p.a.name} and ${p.b.name}`}>
                    <div className="pair-posters">
                      {[p.a, p.b].map((f) => <Poster key={f.key} path={f.posterPath} title={f.name} size="w185" />)}
                    </div>
                    <span className="pair-why">{reasonLine(p, 1)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="shelf-row">
                {s.deal.map((f) => (
                  <button key={f.key} data-key={f.key} className="shelf-item" onPointerDown={() => preloadFilm(f)} onClick={(e) => onOpen(f, e)}>
                    <Poster path={f.posterPath} title={f.name} size="w185" />
                    <span>{s.sub(f)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
        {canDealMore && (
          <div className="deal-more">
            <button className="btn btn-outline" onClick={() => setHome((h) => ({ ...h, more: (h.more || 0) + 1 }))}>
              <Icon d={I.plus} size={16} sw={2.4} />Deal three more
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function FilterSheet({ films, defs, filters, setFilters, onClose }) {
  const matching = films.filter(filterTest(defs, filters)).length;
  const groups = useMemo(() => defs.map(([key, label, opts]) => {
    const base = films.filter(filterTest(defs, filters, key));
    return { key, label, opts: opts.map(([o, l, test]) => ({ o, l, n: base.filter(test).length })) };
  }), [films, defs, filters]);
  const set = (key, o) => setFilters({ ...filters, [key]: filters[key] === o ? "any" : o });
  // Long groups (People, Shelf) show their first dozen plus whatever's picked, with the rest one tap away.
  const [open, setOpen] = useState({});
  const CAP = 12;
  return (
    <Sheet title="Tonight's filters" onClose={onClose} tall
      left={<button className="left" onClick={() => setFilters({})}>Reset</button>}
      foot={<button className="btn btn-primary" onClick={onClose} disabled={!matching}>{matching ? `Pick from ${matching} films` : "Nothing matches yet"}</button>}>
      {groups.filter((g) => g.opts.length).map((g) => (
        <div key={g.key}>
          <div className="section-label">{g.label}</div>
          <div className="tag-row">
            {g.opts.filter((x, i) => open[g.key] || i < CAP || filters[g.key] === x.o).map(({ o, l, n }) => {
              const on = filters[g.key] === o;
              return (
                <button key={o} className={"chip tnum" + (on ? " on" : "") + (!on && n === 0 ? " dim" : "")} aria-pressed={on} onClick={() => set(g.key, o)}>
                  {l} · {n}
                </button>
              );
            })}
            {g.opts.length > CAP && (
              <button className="chip chip-more" onClick={() => setOpen({ ...open, [g.key]: !open[g.key] })} aria-expanded={!!open[g.key]}>
                {open[g.key] ? "Fewer" : `All ${g.opts.length}`}
              </button>
            )}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

// ─── LIBRARY ────────────────────────────────────────────────────────────
// One filter model: OR within a group, AND across groups. The chip row only shows shortcuts into it.
const byCount = (lists) => {
  const m = new Map();
  lists.forEach((l) => [...new Set(l)].forEach((v) => m.set(v, (m.get(v) || 0) + 1)));
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((x) => x[0]);
};
const GENRE_NAMES = { "Science Fiction": "Sci-fi" };
// Groups that get long show their biggest few, with an "All N" to open the rest.
const GROUP_CAP = { label: 10, genre: 12, theme: 10, country: 8, director: 10 };
let regionNames = null;
const countryName = (code) => {
  if (code === "US") return "US";
  if (code === "GB") return "UK";
  try { regionNames ||= new Intl.DisplayNames(["en"], { type: "region" }); return regionNames.of(code) || code; } catch { return code; }
};
const libGroups = (films, customTags, hiddenTags = []) => {
  const has = (fn) => (f) => f.copies.some(fn);
  const formats = FORMATS.filter((x) => films.some(has((c) => c.format === x)));
  const pkgs = PACKAGES.filter((x) => x !== "Standard" && films.some(has((c) => pkgsOf(c).includes(x))));
  const labels = byCount(films.map((f) => f.copies.map((c) => c.label).filter(Boolean)));
  const atLeast = (n, lists) => { const all = byCount(lists); return all.filter((v) => lists.filter((l) => l.includes(v)).length >= n); };
  const decades = [...new Set(films.map((f) => Math.floor(f.yearNum / 10) * 10).filter(Boolean))].sort((a, b) => b - a);
  const genres = atLeast(2, films.map((f) => f.genres));
  const countries = atLeast(2, films.map((f) => f.countries));
  const directors = atLeast(2, films.map((f) => f.directors));
  return [
    ["format", "Format", [
      ...formats.map((x) => [x, x, has((c) => c.format === x)]),
      ...(films.some((f) => f.hasDigital) ? [["hasdigital", "Has digital", (f) => f.hasDigital], ["digitalonly", "Digital only", (f) => f.digitalOnly]] : []),
      ...(films.some((f) => f.unredeemed) ? [["unredeemed", "Unredeemed code", (f) => f.unredeemed]] : []),
      ["none", "Not filled in", (f) => !f.copies.some((c) => c.format)],
    ]],
    ["package", "Packaging", pkgs.map((x) => [x, x, has((c) => pkgsOf(c).includes(x))])],
    ["label", "Distributor", labels.map((x) => [x, x, has((c) => c.label === x)])],
    ["tag", "Tags", [...Object.entries(TAGS).filter(([k]) => !hiddenTags.includes(k)), ...customTags.map((t) => [t, t])].map(([k, l]) => [k, l, (f) => f.tags.includes(k)])],
    ["decade", "Decade", decades.map((d) => [String(d), d + "s", (f) => f.yearNum >= d && f.yearNum < d + 10])],
    ["genre", "Genre", genres.map((g) => [g, GENRE_NAMES[g] || g, (f) => f.genres.includes(g)])],
    ["theme", "Theme", THEMES.map(([k, l]) => [k, l, (f) => f.themes.includes(k), films.filter((f) => f.themes.includes(k)).length]).filter((o) => o[3] > 0).sort((a, b) => b[3] - a[3]).map(([k, l, t]) => [k, l, t])],
    ["country", "Country & language", [
      ...countries.map((c) => [c, countryName(c), (f) => f.countries.includes(c)]),
      ["foreign", "Not in English", (f) => f.lang && f.lang !== "en"],
    ]],
    ["director", "Director", directors.map((d) => [d, d, (f) => f.directors.includes(d)])],
    ["shelf", "Collection", [
      ["recent", "Recently added", (f) => f.recentRank <= 30],
      ["special", "Special editions", (f) => f.special],
      ["multi", "More than one copy", (f) => f.copies.length > 1],
      ["added", "Added in the app", (f) => !!f.userAdded],
    ]],
    ["watch", "Watching", [
      ["five", "5 stars", (f) => f.rating === 5],
      ["four", "4 stars and up", (f) => (f.rating ?? 0) >= 4],
      ["never", "Never logged", (f) => !f.lastWatched],
      ["dusty", "Not seen in 2+ years", (f) => f.lastWatched && yearsSince(f.lastWatched) > 2],
    ]],
    ["length", "Runtime", [
      ["u100", "Under 100 min", (f) => f.runtime && f.runtime < 100],
      ["u120", "Under 2 hours", (f) => f.runtime && f.runtime < 120],
      ["epic", "2½ hours+", (f) => f.runtime >= 150],
    ]],
  ].filter((g) => g[2].length);
};
// Selected options that still exist (a deleted tag or label quietly drops out).
const activeOpts = (groups, sel) => groups.map(([g, name, opts]) => [g, name, opts.filter((o) => (sel[g] || []).includes(o[0]))]).filter((x) => x[2].length);
const selTest = (active, skip) => (f) => active.every(([g, , opts]) => g === skip || opts.some((o) => o[2](f)));

// ─── POSTER COLOR ───────────────────────────────────────────────────────
// Sorting by color needs each poster's dominant hue. Read once per poster from a 92px thumbnail and
// remembered per poster path (a new custom poster gets read again). Stored as [hue, colorfulness, lightness].
// Most posters are black with a splash of color, so the hue comes only from genuinely colored pixels, and
// mostly from how much of the poster a color covers: a red cape on a big blue poster is still a blue poster.
// Posters with too little color count as black-and-white. (v2: area-weighted; v1 let small vivid accents win.)
const COLOR_KEY = "shelf-colors-v2";
store.set("shelf-colors", ""); // the v1 readings, no longer used
const posterColors = readJSON(COLOR_KEY, {});
// Saved as it goes (every couple dozen posters), so leaving the app mid-read loses almost nothing.
const saveColors = () => store.set(COLOR_KEY, JSON.stringify(posterColors));
const loadImg = (src) => new Promise((ok, fail) => {
  const im = new Image();
  im.crossOrigin = "anonymous";
  im.onload = () => ok(im); im.onerror = fail;
  im.src = src;
});
let tmdbCors = null; // does TMDB let us read pixels directly? Learned on the first poster, then the proxy if not
function readColor(im) {
  const W = 24, H = 36;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(im, 0, 0, W, H);
  const d = cx.getImageData(0, 0, W, H).data; // throws if the image isn't readable
  const w = new Float64Array(36), cs = new Float64Array(36), sn = new Float64Array(36);
  let light = 0, vivid = 0;
  const n = W * H;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn;
    light += (mx + mn) / 2;
    if (ch < 0.12 || mx < 0.15) continue;
    let h = mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4;
    h = (h * 60 + 360) % 360;
    // Weight leans on area: sqrt keeps vivid pixels ahead of dull ones without letting a small accent win.
    const bin = Math.floor(h / 10) % 36, rad = (h * Math.PI) / 180, wt = Math.sqrt(ch);
    w[bin] += wt; cs[bin] += wt * Math.cos(rad); sn[bin] += wt * Math.sin(rad);
    vivid += ch;
  }
  let peak = 0, best = -1;
  for (let i = 0; i < 36; i++) { const s = w[(i + 35) % 36] + w[i] + w[(i + 1) % 36]; if (s > best) { best = s; peak = i; } }
  const near = [(peak + 35) % 36, peak, (peak + 1) % 36];
  const hue = (Math.atan2(near.reduce((a, i) => a + sn[i], 0), near.reduce((a, i) => a + cs[i], 0)) * 180) / Math.PI;
  return [Math.round((hue + 360) % 360), Math.round((vivid / n) * 100), Math.round((light / n) * 100)];
}
// Home and the Library can both be reading at once; share one read per poster.
const colorReads = new Map();
const posterColor = (path) => {
  if (!colorReads.has(path)) colorReads.set(path, readPosterColor(path).finally(() => colorReads.delete(path)));
  return colorReads.get(path);
};
async function readPosterColor(path) {
  if (!path) return null;
  const direct = img(path, "w92"), proxied = "/api/img?p=" + encodeURIComponent(path);
  const attempt = async (src) => readColor(await loadImg(src));
  if (tmdbCors !== false) {
    try { const c = await attempt(direct); tmdbCors = true; return c; } catch { if (tmdbCors === null) tmdbCors = false; }
  }
  try { return await attempt(proxied); } catch { return null; }
}
// Reads any posters that haven't been read yet while `on`, six at a time, and re-sorts as results arrive.
function usePosterColors(films, on) {
  const [, bump] = useState(0);
  const [progress, setProgress] = useState(null);
  useEffect(() => {
    if (!on) return;
    const todo = [...new Set(films.map((f) => f.posterPath).filter((p) => p && !(p in posterColors)))];
    if (!todo.length) return;
    let dead = false, done = 0;
    setProgress({ done: 0, of: todo.length });
    const worker = async () => {
      while (todo.length && !dead) {
        const p = todo.shift();
        const c = await posterColor(p);
        if (dead) return;
        posterColors[p] = c; // null = couldn't read; it sorts last and isn't retried every time
        done++;
        if (done % 24 === 0) { saveColors(); bump((x) => x + 1); setProgress({ done, of: done + todo.length }); }
      }
    };
    Promise.all(Array.from({ length: 6 }, worker)).then(() => { if (!dead) { saveColors(); bump((x) => x + 1); setProgress(null); } });
    return () => { dead = true; saveColors(); };
  }, [on, films]);
  return progress;
}
// Rainbow order, which is also warm to cool: reds (starting from the deep pinks) through orange, yellow,
// green, blue, violet, pink. The wheel is cut into 15 bands; inside a band posters run by brightness,
// alternating dark→light and light→dark, so each band hands off to the next at a similar brightness
// instead of strobing. The last band ends light, right where the black-and-white posters begin
// (light to dark). Anything without a readable poster goes last.
const HUE_START = 345, NEUTRAL = 5, BAND = 24;
const colorRank = (f) => {
  const c = posterColors[f.posterPath];
  if (!c) return 20000;
  if (c[1] < NEUTRAL) return 10000 + (100 - c[2]);
  const rot = (c[0] - HUE_START + 360) % 360, band = Math.floor(rot / BAND);
  return band * 200 + (band % 2 ? 100 - c[2] : c[2]) + (rot % BAND) / 100;
};
// Color shelves for Home: one family of the wheel each, only posters that are clearly that color
// (or clearly white / black), laid out as a dark-to-light gradient. Built only once every poster has been read.
const COLOR_SHELVES = [
  ["red", "Red on red", 345, 15], ["orange", "Burnt orange", 15, 40], ["yellow", "Gold and yellow", 40, 68],
  ["green", "Green", 68, 165], ["teal", "Teal", 165, 200], ["blue", "Blue period", 200, 255],
  ["purple", "Purple haze", 255, 300], ["pink", "Hot pink", 300, 345],
];
function buildColorShelves(films) {
  const col = (f) => posterColors[f.posterPath];
  const vivid = (f) => { const c = col(f); return c && c[1] >= 9 ? c : null; };
  const inArc = (h, a, b) => (a < b ? h >= a && h < b : h >= a || h < b);
  const light = (a, b) => col(a)[2] - col(b)[2];
  const shelves = COLOR_SHELVES.map(([id, title, a, b]) => ({ id: "color:" + id, title, test: (f) => { const c = vivid(f); return !!c && inArc(c[0], a, b); } }));
  shelves.push({ id: "color:white", title: "White space", test: (f) => { const c = col(f); return !!c && c[1] < NEUTRAL && c[2] >= 62; } });
  shelves.push({ id: "color:black", title: "Black on black", test: (f) => { const c = col(f); return !!c && c[1] < NEUTRAL && c[2] <= 20; } });
  return shelves.map((r) => {
    const list = films.filter((f) => !f.tags.includes("sell") && r.test(f));
    return { ...r, kind: "color", weight: 0.7, sub: (f) => f.year, order: light, listSort: "color", films: list };
  }).filter((r) => r.films.length >= 8);
}
const byColor = (dir) => (a, b) => {
  const x = colorRank(a), y = colorRank(b);
  const xs = x >= 10000, ys = y >= 10000;
  if (xs !== ys) return xs ? 1 : -1; // colored posters first either way
  return (xs ? x - y : dir * (x - y)) || a.sortKey.localeCompare(b.sortKey);
};

const SORTS = {
  az: ["Title A–Z", (a, b) => a.sortKey.localeCompare(b.sortKey)],
  newest: ["Newest", (a, b) => b.yearNum - a.yearNum || a.sortKey.localeCompare(b.sortKey)],
  oldest: ["Oldest", (a, b) => a.yearNum - b.yearNum || a.sortKey.localeCompare(b.sortKey)],
  rating: ["Top rated", (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.sortKey.localeCompare(b.sortKey)],
  recent: ["Recently added", (a, b) => b.recency - a.recency],
  long: ["Longest runtime", (a, b) => (b.runtime || 0) - (a.runtime || 0)],
  color: ["Color: warm to cool", byColor(1), "Warm to cool"],
  colorcool: ["Color: cool to warm", byColor(-1), "Cool to warm"],
};
const isColorSort = (k) => k === "color" || k === "colorcool";

function Library({ films: allFilms, customTags, extra, setExtra, onOpen, onAdd, searchFocus, onFocused, reset }) {
  // Preferences: digital-only films and films tagged Sell can stay out of the Library unless you go looking.
  const [countDigital] = usePref("shelf-count-digital", false);
  const [hideSell] = usePref("shelf-hide-sell", false);
  const [sel, setSel] = useState({});
  const wantsDigital = (sel.format || []).some((k) => k === "digitalonly" || k === "hasdigital" || /^Digital/.test(k));
  const wantsSell = (sel.tag || []).includes("sell");
  const films = useMemo(() => allFilms.filter((f) => (countDigital || wantsDigital || !f.digitalOnly) && (!hideSell || wantsSell || !f.tags.includes("sell"))),
    [allFilms, countDigital, wantsDigital, hideSell, wantsSell]);
  const [hiddenTagsPref] = usePref("shelf-hidden-tags", "");
  const groups = useMemo(() => libGroups(allFilms, customTags, hiddenTagsPref.split(",").filter(Boolean)), [allFilms, customTags, hiddenTagsPref]);
  const active = useMemo(() => activeOpts(groups, sel), [groups, sel]);
  const nActive = active.reduce((n, g) => n + g[2].length, 0);
  const toggle = (g, k) => setSel((s) => {
    const cur = s[g] || [];
    return { ...s, [g]: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] };
  });
  const isOn = (g, k) => (sel[g] || []).includes(k);
  const [filtering, setFiltering] = useState(false);
  useBodyLock(filtering);
  const [q, setQ] = useState("");
  const byRecent = isOn("shelf", "recent");
  const [sortPref, setSort] = usePref("shelf-sort", "az");
  const sort = SORTS[sortPref] ? sortPref : "az";
  const [view, changeView] = usePref("shelf-libview", "wall");
  const [cols, setCols] = usePref("shelf-wallcols", 4);
  const changeCols = (n) => setCols(Math.max(2, Math.min(6, n)));
  const pinch = useRef(null);
  const onTouchStart = (e) => {
    if (e.touches.length === 2) pinch.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  };
  const onTouchMove = (e) => {
    if (pinch.current == null || e.touches.length !== 2) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (d / pinch.current > 1.25) { changeCols(cols - 1); pinch.current = d; }
    else if (d / pinch.current < 0.8) { changeCols(cols + 1); pinch.current = d; }
  };
  const onTouchEnd = (e) => { if (e.touches.length < 2) pinch.current = null; };
  // The letter rail only appears once the header has scrolled away, so it never sits on the controls.
  const listTop = useRef(null);
  const [railOn, setRailOn] = useState(false);
  useEffect(() => {
    const el = listTop.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setRailOn(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const inputRef = useRef(null);
  useEffect(() => { if (searchFocus) { inputRef.current?.focus(); onFocused(); } }, [searchFocus]);
  // Library tab tapped while open: back to the untouched Library.
  useEffect(() => { if (reset) { setQ(""); setSel({}); setFiltering(false); inputRef.current?.blur(); } }, [reset]);

  const colorProgress = usePosterColors(films, isColorSort(sort) && !byRecent);
  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    const test = selTest(active);
    return films
      .filter((f) => test(f) && (!extra || extra.test(f)))
      .filter((f) => !query || f.name.toLowerCase().includes(query) || f.year === query
        || [...f.directors, ...f.cast, ...f.dop, ...f.music].some((n) => n.toLowerCase().includes(query)))
      .sort(SORTS[byRecent ? "recent" : sort][1]);
  }, [films, active, extra, query, sort, byRecent, colorProgress]);
  const grouped = sort === "az" && !byRecent;
  const letters = useMemo(() => {
    if (!grouped) return [{ letter: null, films: list }];
    const out = [];
    list.forEach((f) => {
      const g = out[out.length - 1];
      if (g && g.letter === f.letter) g.films.push(f); else out.push({ letter: f.letter, films: [f] });
    });
    return out;
  }, [list, grouped]);

  const jump = (letter) => document.getElementById("L-" + letter)?.scrollIntoView({ block: "start" });

  return (
    <>
      <div className="page">
        <div className="page-head">
          <h1>Library</h1>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-btn" onClick={() => changeView(view === "wall" ? "list" : "wall")} aria-label={view === "wall" ? "Show as list" : "Show as poster wall"}>
              <Icon d={view === "wall" ? I.list : I.wall} size={22} sw={1.9} />
            </button>
            <button className="icon-btn" onClick={onAdd} aria-label="Add a film"><Icon d={I.plus} size={24} sw={2.2} /></button>
          </div>
        </div>
        <label className="search">
          <Icon d={I.search} size={16} sw={2.2} />
          <input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, year or anyone in the credits" aria-label="Search the library" />
          {q && <button onClick={() => setQ("")} aria-label="Clear search" style={{ color: "var(--label-2)", display: "grid" }}><Icon d={I.close} size={14} sw={2.4} /></button>}
        </label>
        {extra && (
          <div className="lib-filter">
            <button className="chip on chip-x" onClick={() => reflow(() => setExtra(null))} aria-label={"Remove filter " + extra.label}>
              <span className="extra-label">{extra.label}</span><Icon d={I.close} size={12} sw={2.6} />
            </button>
          </div>
        )}
        <div className="lib-bar">
          <button className={"chip chip-x filter-btn" + (nActive ? " active" : "")} onClick={() => setFiltering(true)} aria-label={nActive ? `Filter, ${nActive} on` : "Filter"}>
            <Icon d={I.sliders} size={15} sw={2} />Filter{nActive > 0 && <span className="count tnum">{nActive}</span>}
          </button>
          <span className="lib-count tnum">
            {colorProgress ? `Colors ${colorProgress.done}/${colorProgress.of}` : list.length === films.length ? `${list.length} films` : `${list.length} of ${films.length}`}
            {(nActive > 0 || extra) && <button className="link" onClick={() => reflow(() => { setSel({}); setExtra(null); })}>Clear</button>}
          </span>
          {view === "wall" && !(nActive > 0 || extra) && (
            <span className="density" role="group" aria-label="Poster size">
              {[["Large", 3], ["Medium", 4], ["Small", 5]].map(([l, n]) => (
                <button key={n} className={cols === n ? "on" : ""} aria-pressed={cols === n} onClick={() => changeCols(n)} aria-label={l + " posters"}>
                  <i style={{ width: 4 + (6 - n) * 2, height: 6 + (6 - n) * 3 }} />
                </button>
              ))}
            </span>
          )}
          <label className="sort">
            {(([l, , short]) => short || l)(SORTS[byRecent ? "recent" : sort])}<Icon d={I.down} size={12} sw={2.6} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div ref={listTop} aria-hidden="true" style={{ height: 1, marginTop: 7 }} />
      <div>
        {list.length === 0 && (
          <div className="empty">
            No films match{query ? ` "${q.trim()}"` : ""}.
            <div style={{ marginTop: 12, display: "flex", gap: 18, justifyContent: "center" }}>
              {(q || nActive > 0 || extra) && <button className="link" onClick={() => reflow(() => { setQ(""); setSel({}); setExtra(null); })}>Clear filters</button>}
              <button className="link" onClick={onAdd}>Add a film</button>
            </div>
          </div>
        )}
        {view === "wall" && list.length > 0 && (
          <div className="wall" style={{ "--cols": cols }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
            {letters.flatMap((g) => g.films.map((f, i) => (
              <button key={f.key} data-key={f.key} id={grouped && i === 0 ? "L-" + g.letter : undefined} onPointerDown={() => preloadFilm(f)} onClick={(e) => onOpen(f, e)} aria-label={`${f.name} (${f.year})`}>
                <Poster path={f.posterPath} title={f.name} size={cols >= 5 ? "w185" : "w342"} />
              </button>
            )))}
          </div>
        )}
        {view === "list" && letters.map((g) => (
          <div key={g.letter || "all"}>
            {g.letter && <div className="letter" id={"L-" + g.letter}>{g.letter}</div>}
            {g.films.map((f) => (
              <button key={f.key} data-key={f.key} className="film-row" onPointerDown={() => preloadFilm(f)} onClick={(e) => onOpen(f, e)}>
                <Poster path={f.posterPath} title={f.name} size="w92" className="thumb" />
                <span className="body">
                  <span className="title">{f.name}</span>
                  <span className="meta tnum">
                    <span>{f.year}</span>
                    {f.directors[0] && <span className="who">{f.directors[0]}</span>}
                    {f.rating != null && <span className="accent">{stars(f.rating)}</span>}
                    {f.badges.slice(0, 1).map((b) => <span key={b} className="badge">{b}</span>)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {filtering && (
        <LibraryFilter films={extra ? allFilms.filter(extra.test) : allFilms} groups={groups} sel={sel} active={active}
          onToggle={toggle} onReset={() => setSel({})} onClose={() => setFiltering(false)} />
      )}

      {grouped && list.length > 40 && (
        <nav className={"rail" + (railOn ? " on" : "")} aria-label="Jump to letter" aria-hidden={!railOn}>
          {letters.map((g) => <button key={g.letter} onClick={() => jump(g.letter)} aria-label={"Jump to " + g.letter}>{g.letter}</button>)}
        </nav>
      )}
    </>
  );
}

// Everything you can narrow the Library by, in one sheet. Counts are live: each one says
// how many films you'd see if you tapped it, given everything else that's on.
function LibraryFilter({ films, groups, sel, active, onToggle, onReset, onClose }) {
  const [more, setMore] = useState({});
  const shown = films.filter(selTest(active)).length;
  const counts = useMemo(() => Object.fromEntries(groups.map(([g, , opts]) => {
    const base = films.filter(selTest(active, g));
    return [g, Object.fromEntries(opts.map(([k, , t]) => [k, base.filter(t).length]))];
  })), [films, groups, active]);
  const on = (g, k) => (sel[g] || []).includes(k);
  const jumpNav = (
    <nav className="fjump" aria-label="Jump to a section">
        {groups.map(([g, name]) => {
          const n = (sel[g] || []).filter((k) => groups.find((x) => x[0] === g)[2].some((o) => o[0] === k)).length;
          return (
            <button key={g} className={n ? "on" : ""} onClick={() => document.getElementById("fg-" + g)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {name.split(" ")[0]}{n > 0 && <span className="tnum"> {n}</span>}
            </button>
          );
        })}
    </nav>
  );
  return (
    <Sheet title="Filter" onClose={onClose} tall
      left={active.length ? <button className="left" onClick={onReset}>Reset</button> : null}
      sub={jumpNav}
      foot={<button className="btn btn-primary" onClick={onClose}>{shown ? `Show ${shown} film${shown === 1 ? "" : "s"}` : "No films match"}</button>}>
      {groups.map(([g, name, opts]) => {
        const cap = more[g] ? Infinity : GROUP_CAP[g] || Infinity;
        const visible = opts.filter((o, i) => i < cap || on(g, o[0]));
        const picked = (sel[g] || []).filter((k) => opts.some((o) => o[0] === k)).length;
        return (
          <section key={g} id={"fg-" + g} className="fgroup">
            <div className="fgroup-head">
              <h3>{name}</h3>
              {picked > 1 && <span className="muted">Any of {picked}</span>}
            </div>
            <div className="fchips">
              {visible.map(([k, l]) => {
                const n = counts[g][k];
                return (
                  <button key={k} className={"chip fchip" + (on(g, k) ? " on" : "")} aria-pressed={on(g, k)} disabled={!n && !on(g, k)} onClick={() => onToggle(g, k)}>
                    {l}<span className="n tnum">{n}</span>
                  </button>
                );
              })}
              {opts.length > visible.length && <button className="chip fchip more" onClick={() => setMore((m) => ({ ...m, [g]: true }))}>All {opts.length}</button>}
            </div>
            {g === "tag" && opts.length <= Object.keys(TAGS).length && <p className="muted fnote">Make your own tags from any film's page.</p>}
          </section>
        );
      })}
    </Sheet>
  );
}

// ─── DIRECTOR ───────────────────────────────────────────────────────────
// Photo, dates and a short bio from TMDB (looked up once per person, then kept on the device),
// plus what your own shelf says about them.
const peopleCache = readJSON("shelf-people", {});
const PEOPLE_V = 2; // bump to refetch cached people (v2 added their filmography)
function useDirector(film) {
  const name = film.directors[0];
  const [info, setInfo] = useState(() => peopleCache[name] || null);
  useEffect(() => {
    setInfo(peopleCache[name] || null);
    if (peopleCache[name]?.v === PEOPLE_V || !film.tmdb || film.tmdbType === "tv") return;
    let dead = false;
    (async () => {
      try {
        const m = await tmdb(`/movie/${film.tmdb}`, { append_to_response: "credits" });
        const crew = (m.credits?.crew || []).find((c) => c.job === "Director" && c.name === name) || (m.credits?.crew || []).find((c) => c.job === "Director");
        if (!crew) return;
        const p = await tmdb(`/person/${crew.id}`, { append_to_response: "movie_credits" });
        // Everything they directed that's actually out, skipping the obscure shorts and student films.
        const today = todayISO(), ids = new Set();
        const films = (p.movie_credits?.crew || [])
          .filter((c) => c.job === "Director" && c.release_date && c.release_date <= today && (c.vote_count || 0) >= 20 && !ids.has(c.id) && ids.add(c.id))
          .map((c) => ({ id: c.id, title: c.title, year: c.release_date.slice(0, 4), poster: c.poster_path || null }));
        const out = { v: PEOPLE_V, id: crew.id, photo: p.profile_path || crew.profile_path || null, born: p.birthday || null, died: p.deathday || null, place: p.place_of_birth || null, bio: (p.biography || "").trim(), films };
        peopleCache[name] = out;
        store.set("shelf-people", JSON.stringify(peopleCache));
        if (!dead) setInfo(out);
      } catch {}
    })();
    return () => { dead = true; };
  }, [name, film.tmdb]);
  return info;
}

function DirectorCard({ film, films, onOpen, onPerson, onPeek, wanted }) {
  const name = film.directors[0];
  const info = useDirector(film);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [film.key]);
  const theirs = films.filter((f) => f.directors.includes(name));
  // Their whole filmography in order: what you own, plus everything else greyed out.
  const strip = useMemo(() => {
    const owned = new Set(theirs.map((f) => Number(f.tmdb)).filter(Boolean));
    const missing = (info?.films || []).filter((m) => !owned.has(m.id))
      .map((m) => ({ key: "tmdb:" + m.id, tmdb: m.id, missing: true, name: m.title, year: m.year, yearNum: +m.year, posterPath: m.poster, sortKey: m.title.toLowerCase() }));
    return [...theirs, ...missing].sort((a, b) => a.yearNum - b.yearNum || a.sortKey.localeCompare(b.sortKey));
  }, [films, name, info]);
  const year = (d) => (d ? d.slice(0, 4) : null);
  const dates = info?.born ? (info.died ? `${year(info.born)}–${year(info.died)}` : `Born ${year(info.born)}`) : null;
  const place = info?.place ? info.place.split(",").map((x) => x.trim()).slice(0, 2).join(", ") : null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const bio = info?.bio || "";
  // The strip opens with this film in view, so you see where it sits in their career.
  const row = useRef(null);
  useLayoutEffect(() => {
    const r = row.current, cur = r?.querySelector(".here");
    if (r && cur) r.scrollLeft = Math.max(0, cur.offsetLeft - r.clientWidth / 2 + cur.clientWidth / 2);
  }, [film.key, strip.length]);
  return (
    <section className="director">
      <div className="section-label caps">{film.directors.length > 1 ? "Directors" : "Director"}</div>
      <button className="dir-head" onClick={() => onPerson(name)} aria-label={`${name}: everything on your shelf`}>
        <span className="director-photo">
          {info?.photo && !photoFailed ? <img src={img(info.photo, "w185")} alt="" onError={() => setPhotoFailed(true)} /> : <span>{name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>}
        </span>
        <span className="dir-name">
          <strong>{peopleLabel(film.directors)}</strong>
          {(dates || place) && <span className="muted">{[dates, place].filter(Boolean).join(" · ")}</span>}
        </span>
        <Icon d={I.chev} size={16} sw={2.4} />
      </button>
      {bio && (
        <p className={"director-bio" + (open ? " open" : "")} onClick={() => setOpen(!open)}>{bio}</p>
      )}
      {strip.length > 1 && (
        <>
          <div className="dir-sub">
            <span className="section-label caps">Filmography</span>
            <span className="muted tnum">{theirs.length} of {strip.length} on your shelf</span>
          </div>
          <div className="shelf-row dir-films" ref={row}>
            {strip.map((f) => f.key === film.key ? (
              <div key={f.key} className="shelf-item here" aria-current="true">
                <Poster path={f.posterPath} title={f.name} size="w185" />
                <span>{f.year} · <em>This film</em></span>
              </div>
            ) : f.missing ? (
              <button key={f.key} className={"shelf-item missing" + (wanted.has((f.name + "|" + f.year).toLowerCase()) ? " wanted" : "")} onClick={() => onPeek(f)} aria-label={`${f.name} (${f.year}), not on your shelf`}>
                <Poster path={f.posterPath} title={f.name} size="w185" />
                {wanted.has((f.name + "|" + f.year).toLowerCase()) && <i className="want-dot" aria-label="On your wishlist"><Icon d={I.heart} size={12} sw={2.4} /></i>}
                <span>{f.year}</span>
              </button>
            ) : (
              <button key={f.key} data-key={f.key} className="shelf-item" onPointerDown={() => preloadFilm(f)} onClick={() => onOpen(f)}>
                <Poster path={f.posterPath} title={f.name} size="w185" />
                <span>{f.year}{f.rating != null ? " · " + stars(f.rating) : ""}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// Swipe-back for anything pushed on the navigation stack (film pages, people, labels, shelves).
function useSwipeBack(ref, onBack) {
  // Swipe right anywhere on the page to go back, like iOS. The listeners are attached once and read
  // the latest onBack through a ref: re-attaching them on every render (a photo loading, a sync check)
  // could drop a swipe midway and leave the page stuck half off screen.
  const onBackRef = useRef(onBack); onBackRef.current = onBack;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sx = 0, sy = 0, t0 = 0, mode = null, dx = 0, leaving = false, uEl = null;
    // The screen underneath (previous film page, or the tabs) slides back in step with your finger.
    const under = () => {
      const prev = el.previousElementSibling;
      return prev && prev.classList.contains("film-page") ? prev : document.querySelector(".under");
    };
    const set = (x, animate, done) => {
      const w = el.clientWidth || window.innerWidth;
      const t = animate ? "0.3s cubic-bezier(.2,.9,.3,1)" : "0s";
      el.style.transition = `transform ${t}`;
      el.style.transform = x ? `translateX(${x}px)` : "";
      // Remember what was underneath when the swipe began: once this page is gone it has no sibling to ask.
      const u = uEl || (uEl = under());
      if (!u) return;
      const dim = u.classList.contains("under") ? document.querySelector(".nav-dim") : null;
      const parts = [u, dim].filter(Boolean);
      if (done === "reset" || (x === 0 && !done)) {
        parts.forEach((p) => { p.style.transition = done === "reset" ? "" : `transform ${t}, filter ${t}, opacity ${t}`; p.style.transform = ""; p.style.filter = ""; p.style.opacity = ""; p.style.visibility = ""; });
        if (done === "reset") uEl = null;
        else setTimeout(() => parts.forEach((p) => { p.style.transition = ""; }), 320);
        return;
      }
      const k = Math.min(1, x / w);
      parts.forEach((p) => { p.style.transition = `transform ${t}, filter ${t}, opacity ${t}`; });
      u.style.transform = `translateX(${-28 * (1 - k)}%)`;
      u.style.visibility = "visible";
      if (dim) dim.style.opacity = String(1 - k);
      else u.style.filter = `brightness(${0.7 + 0.3 * k})`;
    };
    let tgt = null;
    const follow = (t) => {
      unfollow();
      tgt = t;
      tgt.addEventListener("touchmove", move, { passive: false });
      tgt.addEventListener("touchend", end);
      tgt.addEventListener("touchcancel", end);
    };
    const unfollow = () => {
      if (!tgt) return;
      tgt.removeEventListener("touchmove", move);
      tgt.removeEventListener("touchend", end);
      tgt.removeEventListener("touchcancel", end);
      tgt = null;
    };
    // Belt and braces: if a page is ever left parked to the side, the next touch anywhere puts it back.
    const rescue = (e) => {
      if (e.touches.length !== 1 || leaving || !el.style.transform) return;
      unfollow(); mode = null; set(0, true); // a new first finger means any earlier swipe is long over
    };
    const start = (e) => {
      if (e.touches.length !== 1 || e.target.closest(".shelf-row, input, textarea, select, .scrim")) { mode = "off"; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now(); mode = null; dx = 0;
      if (!leaving) uEl = null;
      // Follow the rest of this touch on the element it started on. iOS keeps sending a touch's events
      // to that element even if it's swapped out of the page mid-swipe (a poster or banner finishing
      // loading), and a removed element's events never reach the page, so the page used to get
      // stranded half off screen. Listening on the target itself always hears the end of the swipe.
      follow(e.target);
    };
    const move = (e) => {
      if (mode === "off" || mode === "v") return;
      const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
      if (mode == null) {
        if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
        mode = x > 0 && Math.abs(x) > Math.abs(y) * 1.4 ? "h" : "v";
        if (mode === "v") return;
      }
      dx = Math.max(0, x);
      if (e.cancelable) e.preventDefault();
      set(dx, false);
    };
    const end = () => {
      unfollow();
      if (mode !== "h") {
        mode = null;
        if (!leaving && el.style.transform) set(0, true); // never leave the page parked off to the side
        return;
      }
      mode = null;
      const w = el.clientWidth || window.innerWidth;
      const fast = dx / Math.max(1, Date.now() - t0) > 0.5 && dx > 40;
      if (dx > w * 0.33 || fast) {
        leaving = true;
        set(w, true, "finish");
        setTimeout(() => { el.style.transition = "none"; onBackRef.current({ swiped: true }); setTimeout(() => set(0, false, "reset"), 30); }, 260);
      } else set(0, true);
    };
    el.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchstart", rescue, { passive: true, capture: true });
    return () => {
      unfollow();
      el.removeEventListener("touchstart", start);
      document.removeEventListener("touchstart", rescue, { capture: true });
    };
  }, []);
}

const stackClass = (nav, below, still, extra = "") =>
  "film-page" + extra + (nav === "leaving" ? " leaving" : "") + (below ? " below" : "") + (still ? " still" : "");

// A list pushed onto the stack: everything on the shelf by a person, on a label, or on a Home shelf.
// It slides in and swipes back exactly like a film page, so drilling Film → Director → Film → … always
// has a way back.
const ROLES = [["directors", "Directed"], ["dop", "Shot"], ["music", "Scored"], ["cast", "Acted in"]];
function ListPage({ nav = "in", below = false, entry, films, backLabel, onBack, onOpen }) {
  const ref = useRef(null);
  const [mountedBelow] = useState(below);
  useSwipeBack(ref, onBack);
  const person = entry.kind === "person" ? entry.label : null;
  const [sort, setSort] = useState(entry.sort || (person ? "oldest" : "az"));
  const colorProgress = usePosterColors(films, isColorSort(sort));
  const list = useMemo(() => films.filter(entry.test).sort(SORTS[sort][1]), [films, entry, sort, colorProgress]);
  const roles = person ? ROLES.map(([k, l]) => [l, list.filter((f) => f[k].includes(person)).length]).filter(([, n]) => n) : [];
  const rated = list.filter((f) => f.rating != null);
  const avg = rated.length > 1 ? rated.reduce((n, f) => n + f.rating, 0) / rated.length : null;
  const photo = person ? peopleCache[person]?.photo : null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const [cols] = useState(() => Math.max(3, Math.min(5, +store.get("shelf-wallcols") || 4)));
  return (
    <div className={stackClass(nav, below, mountedBelow, " list-page")} ref={ref} role="dialog" aria-label={entry.label} aria-hidden={below || undefined}>
      <div className="film-inner">
        <div className="list-bar">
          <button className="back" onClick={() => onBack()}><Icon d={I.back} size={20} sw={2.4} /><span>{backLabel}</span></button>
        </div>
        <div className="list-head">
          {person && (
            <span className="director-photo">
              {photo && !photoFailed ? <img src={img(photo, "w185")} alt="" onError={() => setPhotoFailed(true)} /> : <span>{person.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>}
            </span>
          )}
          <div className="list-title">
            <h1>{entry.label}</h1>
            <span className="director-stats tnum">
              <span><b>{list.length}</b> on your shelf</span>
              {avg != null && <span><b>{avg.toFixed(1)}★</b> your average</span>}
            </span>
            {roles.length > 1 && <span className="muted tnum list-roles">{roles.map(([l, n]) => `${l} ${n}`).join(" · ")}</span>}
          </div>
        </div>
        <div className="lib-bar list-sort">
          <span className="lib-count tnum muted">{list.length === 1 ? "1 film" : list.length + " films"}</span>
          <label className="sort">
            {SORTS[sort][2] || SORTS[sort][0]}<Icon d={I.down} size={12} sw={2.6} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        {list.length === 0 ? <div className="empty">Nothing on the shelf here any more.</div> : (
          <div className="wall" style={{ "--cols": cols }}>
            {list.map((f) => (
              <button key={f.key} data-key={f.key} onPointerDown={() => preloadFilm(f)} onClick={() => onOpen(f)} aria-label={`${f.name} (${f.year})`}>
                <Poster path={f.posterPath} title={f.name} size={cols >= 5 ? "w185" : "w342"} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── YOU ────────────────────────────────────────────────────────────────
// A page pushed onto the stack with a back button and swipe-back: the You tab's rows open these.
function StackPage({ nav = "in", below = false, label, backLabel, onBack, children }) {
  const ref = useRef(null);
  const [mountedBelow] = useState(below);
  useSwipeBack(ref, onBack);
  return (
    <div className={stackClass(nav, below, mountedBelow, " list-page")} ref={ref} role="dialog" aria-label={label} aria-hidden={below || undefined}>
      <div className="film-inner">
        <div className="list-bar">
          <button className="back" onClick={() => onBack()}><Icon d={I.back} size={20} sw={2.4} /><span>{backLabel}</span></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const YouRow = ({ icon, label, value, dot, onClick, plain }) => (
  <button className="you-row" onClick={onClick}>
    <span className={"you-ic" + (plain ? " plain" : "")}><Icon d={icon} size={17} sw={2} /></span>
    <span className="you-rb">
      <span className="you-lbl">{label}</span>
      {value != null && <span className="you-val tnum">{dot && <i className={"you-dot " + dot} />}{value}</span>}
      <Icon d={I.chev} size={14} sw={2.6} />
    </span>
  </button>
);

function You({ films, want, programs, sync, onOpen, onPush }) {
  const yr = String(thisYear());
  const watchedThisYear = films.filter((f) => f.views.some((v) => v.startsWith(yr))).length;
  const rated = films.filter((f) => f.rating != null);
  const avg = rated.length ? rated.reduce((n, f) => n + f.rating, 0) / rated.length : null;
  const recent = useMemo(() => films.flatMap((f) => f.views.map((d) => ({ d, f }))).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 4), [films]);
  const open = want.filter((w) => !w.bought);
  const total = open.reduce((n, w) => n + (w.price || 0), 0);
  const st = sync.status;
  const syncVal = !sync.on ? "Off" : st.state === "error" ? "Not synced" : st.state === "syncing" ? "Syncing" : "Synced";
  const syncDot = !sync.on ? "off" : st.state === "error" ? "bad" : st.state === "syncing" ? "busy" : "ok";
  return (
    <div className="page you">
      <div className="page-head"><h1>You</h1></div>
      <div className="you-id">
        <span className="you-avatar" aria-hidden="true">J</span>
        <span>
          <strong>Jack</strong>
          <span className="muted">@j_ck on Letterboxd</span>
        </span>
      </div>
      <div className="strip you-strip">
        <div><b>{films.length}</b><span>On the shelf</span></div>
        <div><b>{watchedThisYear}</b><span>Watched in {yr}</span></div>
        <div><b>{avg != null ? avg.toFixed(1) + "★" : "—"}</b><span>Your average</span></div>
      </div>
      {recent.length > 0 && (
        <section className="you-recent">
          <div className="dir-sub">
            <span className="section-label caps">Recently watched</span>
            <button className="link" style={{ fontSize: 15 }} onClick={() => onPush({ kind: "diary", label: "Diary" })}>Diary</button>
          </div>
          <div className="you-recent-row">
            {recent.map(({ d, f }) => (
              <button key={f.key + d} className="you-recent-item" onPointerDown={() => preloadFilm(f)} onClick={() => onOpen(f)} aria-label={`${f.name}, watched ${fmtDate(d)}`}>
                <Poster path={f.posterPath} title={f.name} size="w185" />
                <span className="tnum">{fmtDate(d).replace(/, \d{4}$/, "")}</span>
                {f.rating != null && <span className="accent stars-sm">{stars(f.rating)}</span>}
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="you-group">
        <YouRow icon={I.heart} label="Wishlist" value={open.length ? `${open.length}${total ? " · " + usd(total) : ""}` : "Empty"} onClick={() => onPush({ kind: "wishlist", label: "Wishlist" })} />
        <YouRow icon={I.calendar} label="Diary" value={`${watchedThisYear} this year`} onClick={() => onPush({ kind: "diary", label: "Diary" })} />
        <YouRow icon={I.doubles} label="Double features" value={programs.length ? `${programs.length} saved` : "None saved"} onClick={() => onPush({ kind: "doubles", label: "Double features", view: programs.length ? "saved" : "feed" })} />
        <YouRow icon={I.stats} label="Stats" onClick={() => onPush({ kind: "stats", label: "Stats" })} />
      </div>
      <div>
        <div className="section-label caps" style={{ padding: "0 4px 8px" }}>Settings</div>
        <div className="you-group">
          <YouRow plain icon={I.sliders} label="Preferences" onClick={() => onPush({ kind: "prefs", label: "Preferences" })} />
          <YouRow plain icon={I.tag} label="Tags & labels" onClick={() => onPush({ kind: "tags", label: "Tags & labels" })} />
          <YouRow plain icon={I.cloud} label="Backup & sync" value={syncVal} dot={syncDot} onClick={() => onPush({ kind: "backup", label: "Backup & sync" })} />
        </div>
      </div>
      <p className="foot" style={{ textAlign: "center" }}>The Shelf · Film data and images from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
  );
}

// Every watch: your shelf's history (with rewatches), what you log here, and an imported Letterboxd diary.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
function Diary({ films, watchLog, onOpen }) {
  const entries = useMemo(() => {
    const out = [];
    const owned = new Set(films.map((f) => f.key));
    films.forEach((f) => {
      const per = new Map(f.diary.map((e) => [e.date, e.rating]));
      const last = f.views[f.views.length - 1];
      f.views.forEach((d) => out.push({ id: f.key + "@" + d, date: d, title: f.name, year: f.year, dir: f.directors[0] || "", rating: per.get(d) ?? (d === last ? f.rating : null), film: f }));
    });
    Object.entries(watchLog).forEach(([k, v]) => {
      if (owned.has(k)) return;
      const i = k.lastIndexOf("|");
      entriesOf(v).forEach((e) => out.push({ id: k + "@" + e.date, date: e.date, title: k.slice(0, i), year: k.slice(i + 1), dir: "", rating: e.rating ?? null, film: null }));
    });
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  }, [films, watchLog]);
  const years = useMemo(() => [...new Set(entries.map((e) => e.date.slice(0, 4)))], [entries]);
  const [year, setYear] = useState(() => years[0] || String(thisYear()));
  const [view, setView] = usePref("shelf-diaryview", "list");
  const shown = entries.filter((e) => e.date.startsWith(year));
  const r = shown.filter((e) => e.rating != null);
  const avg = r.length ? r.reduce((n, e) => n + e.rating, 0) / r.length : null;
  const months = [];
  shown.forEach((e) => { const m = e.date.slice(0, 7); const g = months[months.length - 1]; if (g && g.m === m) g.list.push(e); else months.push({ m, list: [e] }); });
  const day = (d) => new Date(d + "T12:00:00");
  return (
    <div className="page diary">
      <div className="page-head">
        <h1>Diary</h1>
        <label className="chip chip-x diary-year">
          {year}<Icon d={I.down} size={11} sw={2.8} />
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <div className="lib-bar">
        <span className="lib-count tnum muted">{shown.length} {shown.length === 1 ? "watch" : "watches"}{avg != null ? ` · ${avg.toFixed(1)}★ average` : ""}</span>
        <div className="seg diary-seg" role="group" aria-label="View">
          <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
          <button className={view === "grid" ? "on" : ""} aria-pressed={view === "grid"} onClick={() => setView("grid")}>Posters</button>
        </div>
      </div>
      {shown.length === 0 && <div className="empty">Nothing logged in {year}.</div>}
      <div className="diary-months">
        {months.map(({ m, list }) => (
          <section key={m}>
            <div className="letter diary-month">{MONTHS[+m.slice(5) - 1]} {m.slice(0, 4)}</div>
            {view === "list" ? list.map((e) => {
              const Tag = e.film ? "button" : "div";
              return (
                <Tag key={e.id} className={"diary-row" + (e.film ? "" : " unowned")} {...(e.film ? { "data-key": e.film.key, onClick: () => onOpen(e.film), onPointerDown: () => preloadFilm(e.film) } : {})}>
                  <span className="diary-day"><b className="tnum">{+e.date.slice(8)}</b><i>{DOW[day(e.date).getDay()]}</i></span>
                  {e.film ? <Poster path={e.film.posterPath} title={e.title} size="w92" className="thumb" /> : <span className="thumb poster-empty" aria-hidden="true" />}
                  <span className="body">
                    <span className="title">{e.title} <span className="muted tnum">{e.year}</span></span>
                    <span className="meta"><span className="who">{e.film ? e.dir : "Not on your shelf"}</span>{e.rating != null && <span className="accent stars-sm" style={{ marginLeft: "auto" }}>{stars(e.rating)}</span>}</span>
                  </span>
                </Tag>
              );
            }) : (
              <div className="wall diary-wall" style={{ "--cols": 4 }}>
                {list.map((e) => e.film ? (
                  <button key={e.id} data-key={e.film.key} onClick={() => onOpen(e.film)} onPointerDown={() => preloadFilm(e.film)} aria-label={`${e.title}, ${e.date}`}>
                    <Poster path={e.film.posterPath} title={e.title} size="w185" />
                    <span className="diary-badge tnum">{+e.date.slice(8)}</span>
                  </button>
                ) : (
                  <div key={e.id} className="diary-tile-unowned"><span>{e.title}</span><span className="diary-badge tnum">{+e.date.slice(8)}</span></div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// iOS-style switch and value pickers for Preferences.
const Switch = ({ on, onChange, label }) => (
  <button className="pref-cell" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
    <span className="grow">{label}</span><span className={"switch" + (on ? " on" : "")}><i /></span>
  </button>
);
const PickRow = ({ label, value, options, onChange }) => (
  <label className="pref-cell">
    <span className="grow">{label}</span>
    <span className="pref-val">{options.find((o) => String(o[0]) === String(value))?.[1]}<Icon d={I.down} size={12} sw={2.6} /></span>
    <select value={value} onChange={(e) => onChange(typeof options[0][0] === "number" ? +e.target.value : e.target.value)} aria-label={label}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </label>
);
const SegRow = ({ label, value, options, onChange }) => (
  <div className="pref-cell">
    <span className="grow">{label}</span>
    <div className="seg pref-seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  </div>
);
function Prefs({ finish, setFinish, removed = [], onRestore }) {
  const [showRemoved, setShowRemoved] = useState(false);
  const [view, setView] = usePref("shelf-libview", "wall");
  const [sort, setSort] = usePref("shelf-sort", "az");
  const [cols, setCols] = usePref("shelf-wallcols", 4);
  const [randomPick, setRandomPick] = usePref("shelf-random-pick", false);
  const [deal, setDeal] = usePref("shelf-deal-count", 6);
  const [brk, setBrk] = usePref("shelf-break-min", 15);
  const [countDigital, setCountDigital] = usePref("shelf-count-digital", false);
  const [hideSell, setHideSell] = usePref("shelf-hide-sell", false);
  const [deckDays, setDeckDays] = usePref("shelf-deck-days", 7);
  const [hiddenTagsPref] = usePref("shelf-hidden-tags", "");
  const sellRemoved = hiddenTagsPref.split(",").includes("sell");
  return (
    <div className="page prefs">
      <div className="page-head"><h1>Preferences</h1></div>
      <section>
        <div className="section-label caps pref-sec">Library</div>
        <div className="you-group">
          <SegRow label="Opens as" value={view} options={[["wall", "Poster wall"], ["list", "List"]]} onChange={setView} />
          <PickRow label="Sort by" value={SORTS[sort] ? sort : "az"} options={Object.entries(SORTS).map(([k, [l]]) => [k, l])} onChange={setSort} />
          <SegRow label="Poster size" value={cols} options={[[3, "L"], [4, "M"], [5, "S"]]} onChange={setCols} />
        </div>
      </section>
      <section>
        <div className="section-label caps pref-sec">Home</div>
        <div className="you-group">
          <Switch label="New pick every time you open the app" on={randomPick} onChange={setRandomPick} />
          <PickRow label="Shelves per deal" value={deal} options={[[3, "3"], [6, "6"], [9, "9"]]} onChange={setDeal} />
        </div>
        <p className="foot pref-foot">Off: Home keeps the same pick all day until you tap Pick another.</p>
      </section>
      <section>
        <div className="section-label caps pref-sec">On deck</div>
        <div className="you-group">
          <PickRow label="Films stay on deck" value={deckDays} options={[[3, "3 days"], [5, "5 days"], [7, "7 days"], [10, "10 days"], [14, "14 days"]]} onChange={setDeckDays} />
        </div>
        <p className="foot pref-foot">A film also leaves the moment you log a watch of it.</p>
      </section>
      <section>
        <div className="section-label caps pref-sec">Double features</div>
        <div className="you-group">
          <PickRow label="Finish by" value={finish} options={FINISH} onChange={setFinish} />
          <PickRow label="Break between films" value={brk} options={[[0, "None"], [10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"]]} onChange={setBrk} />
        </div>
      </section>
      <section>
        <div className="section-label caps pref-sec">Collection</div>
        <div className="you-group">
          <Switch label="Count digital-only films" on={countDigital} onChange={setCountDigital} />
          {!sellRemoved && <Switch label="Hide films tagged Sell" on={hideSell} onChange={setHideSell} />}
        </div>
        <p className="foot pref-foot">Off: films you only own digitally stay out of your shelf count, Home and Stats. Filter the Library by Digital only to see them.</p>
      </section>
      {removed.length > 0 && (
        <section>
          <div className="section-label caps pref-sec">Removed from collection</div>
          <div className="you-group">
            <button className="pref-cell" onClick={() => setShowRemoved(!showRemoved)} aria-expanded={showRemoved}>
              <span className="grow">{removed.length} {removed.length === 1 ? "film" : "films"}</span>
              <span className="pref-val">{showRemoved ? "Hide" : "Show"}<Icon d={I.down} size={12} sw={2.6} /></span>
            </button>
            {showRemoved && removed.map((r) => (
              <div className="pref-cell" key={r.key}>
                <span className="grow">{r.name} <span className="muted tnum">{r.year}</span></span>
                <button className="link" onClick={() => onRestore(r.key)}>Restore</button>
              </div>
            ))}
          </div>
          <p className="foot pref-foot">Restoring brings a film back with its copies, tags and notes. Watch history was never touched.</p>
        </section>
      )}
    </div>
  );
}

function TagsView({ films, D }) {
  const [renaming, setRenaming] = useState(null);
  const [newTag, setNewTag] = useState(null);
  const count = (k) => films.filter((f) => f.rawTags.includes(k)).length;
  const [hiddenTagsPref, setHiddenTags] = usePref("shelf-hidden-tags", "");
  const hidden = hiddenTagsPref.split(",").filter(Boolean);
  const hideTag = (k) => setHiddenTags([...new Set([...hidden, k])].join(","));
  const restoreTag = (k) => setHiddenTags(hidden.filter((x) => x !== k).join(","));
  const typed = D.labels.filter((l) => !KNOWN_LABELS.includes(l));
  const addTag = () => { const t = (newTag || "").trim().replace(/\s+/g, " "); if (t && !TAGS[t]) D.addTag(t); setNewTag(null); };
  return (
    <div className="page prefs">
      <div className="page-head"><h1>Tags &amp; labels</h1></div>
      <section>
        <div className="section-label caps pref-sec">Built-in tags</div>
        <div className="you-group">
          {Object.entries(TAGS).filter(([k]) => !hidden.includes(k)).map(([k, l]) => (
            <div className="pref-cell" key={k}>
              <span className="grow">{l} <span className="muted tnum">· {count(k)}</span></span>
              <button style={{ fontSize: 15, color: "var(--danger)" }} onClick={() => hideTag(k)}>Remove</button>
            </div>
          ))}
          {hidden.length === Object.keys(TAGS).length && <div className="pref-cell muted" style={{ fontSize: 15 }}>All built-in tags removed.</div>}
        </div>
        <p className="foot pref-foot">Removing one hides it everywhere: on films, in filters and its Home shelf{hidden.includes("sell") ? "" : ", and for Sell, the Hide films tagged Sell switch"}. Films keep it quietly, so restoring brings everything back.</p>
        {hidden.length > 0 && (
          <>
            <div className="section-label caps pref-sec" style={{ marginTop: 18 }}>Removed</div>
            <div className="you-group">
              {hidden.filter((k) => TAGS[k]).map((k) => (
                <div className="pref-cell" key={k}>
                  <span className="grow muted">{TAGS[k]} <span className="tnum">· {count(k)}</span></span>
                  <button className="link" style={{ fontSize: 15 }} onClick={() => restoreTag(k)}>Restore</button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <section>
        <div className="dir-sub pref-sec"><span className="section-label caps">Your tags</span><button className="link" onClick={() => setNewTag("")}>New tag</button></div>
        <div className="you-group">
          {newTag != null && (
            <form className="pref-cell" onSubmit={(e) => { e.preventDefault(); addTag(); }}>
              <input className="field" style={{ height: 36, fontSize: 16 }} value={newTag} onChange={(e) => setNewTag(e.target.value)} autoFocus maxLength={32} placeholder="Tag name" aria-label="New tag name" onBlur={addTag} />
            </form>
          )}
          {D.customTags.length === 0 && newTag == null && <div className="pref-cell muted" style={{ fontSize: 15 }}>None yet. Make one here or from any film's Tags.</div>}
          {D.customTags.map((t) => (
            <div className="pref-cell" key={t}>
              {renaming && renaming.from === t ? (
                <form className="grow" style={{ display: "flex", gap: 8 }} onSubmit={(e) => {
                  e.preventDefault();
                  const to = renaming.to.trim().replace(/\s+/g, " ");
                  if (to && to !== t && !TAGS[to]) D.renameTag(t, to);
                  setRenaming(null);
                }}>
                  <input className="field" style={{ height: 34, fontSize: 15 }} value={renaming.to} onChange={(e) => setRenaming({ from: t, to: e.target.value })} aria-label={"Rename " + t} autoFocus maxLength={32} />
                  <button className="link" type="submit">Save</button>
                </form>
              ) : (
                <>
                  <span className="grow">{t} <span className="muted tnum">· {count(t)}</span></span>
                  <button className="link" style={{ fontSize: 15 }} onClick={() => setRenaming({ from: t, to: t })}>Rename</button>
                  <button style={{ fontSize: 15, color: "var(--danger)", marginLeft: 14 }} onClick={() => D.removeTag(t)}>Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
        <p className="foot pref-foot">Removing a tag takes it off every film.</p>
      </section>
      <section>
        <div className="section-label caps pref-sec">Labels you've typed</div>
        <div className="you-group">
          {typed.length === 0 && <div className="pref-cell muted" style={{ fontSize: 15 }}>No custom labels. Add one from any copy's label chips.</div>}
          {typed.map((l) => (
            <div className="pref-cell" key={l}>
              <span className="grow">{l} <span className="muted tnum">· {films.filter((f) => f.copies.some((c) => c.label === l)).length}</span></span>
              <button style={{ fontSize: 15, color: "var(--danger)" }} onClick={() => D.removeLabel(l)}>Remove</button>
            </div>
          ))}
        </div>
        <p className="foot pref-foot">Removing a label takes it off the chip list. Copies already using it keep it.</p>
      </section>
      <section>
        <div className="section-label caps pref-sec">Built-in labels</div>
        <div className="tag-row">{KNOWN_LABELS.map((l) => <span key={l} className="chip">{l}</span>)}</div>
        <p className="foot pref-foot">Always offered when you add a copy. Your most-used labels float to the front.</p>
      </section>
    </div>
  );
}

// Double features, pushed onto the stack from Home or a film page instead of living in a tab.
function DoublesPage({ nav = "in", below = false, entry, films, ix, programs, onNight, finish, backLabel, onBack }) {
  const ref = useRef(null);
  const [mountedBelow] = useState(below);
  useSwipeBack(ref, onBack);
  const [view, setView] = useState(entry.view || "feed");
  const [anchor, setAnchor] = useState(entry.anchor || null);
  return (
    <div className={stackClass(nav, below, mountedBelow, " list-page")} ref={ref} role="dialog" aria-label="Double features" aria-hidden={below || undefined}>
      <div className="film-inner">
        <div className="list-bar">
          <button className="back" onClick={() => onBack()}><Icon d={I.back} size={20} sw={2.4} /><span>{backLabel}</span></button>
        </div>
        <Doubles films={films} ix={ix} programs={programs} view={view} setView={setView} anchor={anchor} setAnchor={setAnchor} onNight={onNight} finish={finish}
          toTop={(smooth) => ref.current?.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" })} />
      </div>
    </div>
  );
}

// ─── WISHLIST ───────────────────────────────────────────────────────────
// Posters for wants are looked up on TMDB once and kept on this device.
const wantArt = readJSON("shelf-want-art", {});
function useWantArt(list) {
  const [art, setArt] = useState(wantArt);
  useEffect(() => {
    let dead = false;
    const todo = list.filter((w) => !w.set && !w.poster && !(wantId(w) in wantArt));
    if (!todo.length) return;
    (async () => {
      for (const w of todo) {
        if (dead) return;
        try {
          const res = await tmdb("/search/movie", { query: w.film, ...(w.year ? { year: w.year } : {}) });
          const hit = (res.results || []).find((r) => w.year && (r.release_date || "").startsWith(w.year)) || res.results?.[0];
          wantArt[wantId(w)] = hit ? { poster: hit.poster_path || null, tmdb: hit.id } : null;
        } catch { return; } // offline or TMDB hiccup: try again next time
        store.set("shelf-want-art", JSON.stringify(wantArt));
        if (!dead) setArt({ ...wantArt });
      }
    })();
    return () => { dead = true; };
  }, [list.length]);
  return art;
}
const WANT_SEGS = [["all", "All"], ["new", "New"], ["upgrade", "Upgrades"], ["set", "Sets"]];
const WANT_SORTS = {
  recent: ["Recently added", null],
  title: ["Title A–Z", (a, b) => sortKey(a.film).toLowerCase().localeCompare(sortKey(b.film).toLowerCase())],
  low: ["Price: low to high", (a, b) => (a.price ?? 1e9) - (b.price ?? 1e9)],
  high: ["Price: high to low", (a, b) => (b.price ?? -1) - (a.price ?? -1)],
  year: ["Oldest film", (a, b) => (+a.year || 9999) - (+b.year || 9999)],
};
const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function WantThumb({ w, path, className = "thumb" }) {
  if (w.set) return <span className={className + " set-thumb"} aria-hidden="true"><i /><i /><i /></span>;
  return <Poster path={path} title={w.film} size="w92" className={className} />;
}

function Wishlist({ want, films, onOpenWant, onNew }) {
  const [seg, setSeg] = useState("all");
  const [sort, setSort] = useState(() => (WANT_SORTS[store.get("shelf-wantsort")] ? store.get("shelf-wantsort") : "recent"));
  const [q, setQ] = useState("");
  const [showGot, setShowGot] = useState(false);
  const owned = useMemo(() => new Map(films.map((f) => [(f.name + "|" + f.year).toLowerCase(), f])), [films]);
  const art = useWantArt(want);
  // An owned film is an upgrade when you said so, or when it came from a store list (you saved a better edition);
  // an old "new" want you now own was probably bought, so it gets flagged instead.
  const ownedOf = (w) => owned.get(wantId(w).toLowerCase());
  const kindOf = (w) => (w.set ? "set" : w.kind === "upgrade" || (ownedOf(w) && w.store) ? "upgrade" : "new");
  const tmdbOf = (w) => w.tmdb || ownedOf(w)?.tmdb || art[wantId(w)]?.tmdb || null;
  const pathOf = (w) => w.poster || owned.get(wantId(w).toLowerCase())?.posterPath || art[wantId(w)]?.poster || null;
  const open = want.filter((w) => !w.bought);
  const got = want.filter((w) => w.bought);
  const query = q.trim().toLowerCase();
  const list = open
    .filter((w) => seg === "all" || kindOf(w) === seg)
    .filter((w) => !query || [w.film, w.label, w.store, w.note].some((x) => (x || "").toLowerCase().includes(query)));
  if (WANT_SORTS[sort][1]) list.sort(WANT_SORTS[sort][1]);
  const priced = list.filter((w) => w.price != null);
  const total = priced.reduce((n, w) => n + w.price, 0);
  const counts = Object.fromEntries(WANT_SEGS.map(([k]) => [k, k === "all" ? open.length : open.filter((w) => kindOf(w) === k).length]));

  const row = (w) => {
    const kind = kindOf(w);
    return (
      <button key={wantId(w)} className={"film-row want-row" + (w.bought ? " got" : "")} onClick={() => onOpenWant(w)}>
        <WantThumb w={w} path={pathOf(w)} />
        <span className="body">
          <span className="title">{w.film}{w.year && <span className="muted tnum"> {w.year}</span>}</span>
          {w.label && <span className="meta"><span className="who">{w.label}</span></span>}
          <span className="meta tnum">
            {kind === "upgrade" && <span className="badge accent-badge">Upgrade</span>}
            {kind === "set" && <span className="badge">Set</span>}
            {kind === "new" && ownedOf(w) && !w.bought && <span className="accent">Already on your shelf</span>}
            {w.store && <span>{w.store}</span>}
            {w.price != null && <span>{usd(w.price)}</span>}
          </span>
          {!w.set && <ScoreLine tmdbId={tmdbOf(w)} className="critics small" />}
        </span>
      </button>
    );
  };

  return (
    <div className="page wish-page">
      <div className="page-head">
        <h1>Wishlist</h1>
        <button className="icon-btn" onClick={onNew} aria-label="Add a want"><Icon d={I.plus} size={24} sw={2.2} /></button>
      </div>
      <label className="search">
        <Icon d={I.search} size={16} sw={2.2} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, edition or store" aria-label="Search the wishlist" />
      </label>
      <div className="seg" role="tablist" aria-label="Show">
        {WANT_SEGS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={seg === k} className={seg === k ? "on" : ""} onClick={() => setSeg(k)}>{l} <span className="tnum seg-n">{counts[k]}</span></button>
        ))}
      </div>
      <div className="lib-bar">
        <span className="lib-count tnum muted">{list.length} {list.length === 1 ? "want" : "wants"}{priced.length ? ` · ${usd(total)}` : ""}</span>
        <label className="sort">
          {WANT_SORTS[sort][0]}<Icon d={I.down} size={12} sw={2.6} />
          <select value={sort} onChange={(e) => { setSort(e.target.value); store.set("shelf-wantsort", e.target.value); }} aria-label="Sort by">
            {Object.entries(WANT_SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="want-list">
        {list.length === 0 && <div className="empty">{query ? `Nothing on the wishlist matches "${q.trim()}".` : "Nothing here. Tap + to add a want, or tap a greyed-out poster in any director's filmography."}</div>}
        {list.map(row)}
      </div>
      {got.length > 0 && (
        <div className="want-list">
          <button className="got-head" onClick={() => setShowGot(!showGot)} aria-expanded={showGot}>
            <span>Got it <span className="muted tnum">{got.length}</span></span>
            <Icon d={I.down} size={13} sw={2.6} />
          </button>
          {showGot && got.map(row)}
        </div>
      )}
    </div>
  );
}

// One want: where to buy it, what edition, and "Got it" when it arrives.
function WantSheet({ w, films, onUpdate, onRemove, onGot, onOpenFilm, onClose }) {
  const ownedFilm = films.find((f) => (f.name + "|" + f.year).toLowerCase() === wantId(w).toLowerCase());
  const [label, setLabel] = useState(w.label || "");
  const [store_, setStore] = useState(w.store || "");
  const [price, setPrice] = useState(w.price != null ? String(w.price) : "");
  const [url, setUrl] = useState(w.url || "");
  const [note, setNote] = useState(w.note || "");
  const art = wantArt[wantId(w)];
  const path = w.poster || ownedFilm?.posterPath || art?.poster || null;
  const save = () => {
    const p = parseFloat(price.replace(/[$,]/g, ""));
    onUpdate({ label: label.trim(), store: store_.trim(), price: Number.isFinite(p) ? p : undefined, url: url.trim(), note: note.trim() });
  };
  const close = () => { save(); onClose(); };
  return (
    <Sheet title={w.set ? "Box set" : ownedFilm ? "Upgrade" : "Want"} onClose={close}>
      <div className="want-hero">
        <WantThumb w={w} path={path} className="want-poster" />
        <div>
          <h2>{w.film}</h2>
          <span className="muted tnum">{[w.year, w.price != null && usd(w.price), w.store].filter(Boolean).join(" · ")}</span>
          {ownedFilm && <button className="link" style={{ fontSize: 14, marginTop: 6 }} onClick={() => { save(); onOpenFilm(ownedFilm); }}>You own a copy. See it</button>}
        </div>
      </div>
      <div className="btn-row want-actions">
        {url && <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">Open at {store_ || "store"}</a>}
        {!w.bought
          ? <button className={"btn " + (url ? "btn-outline" : "btn-primary")} onClick={() => { save(); onGot(); }}>{ownedFilm ? "Got it, add the new copy" : w.set ? "Got it" : "Got it, add to my shelf"}</button>
          : <button className="btn btn-outline" onClick={() => { save(); onUpdate({ bought: false }); onClose(); }}>Move back to wants</button>}
      </div>
      <div className="want-fields">
        <label><span>Edition</span><input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Arrow 4K Limited Edition" /></label>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1 }}><span>Store</span><input className="field" value={store_} onChange={(e) => setStore(e.target.value)} placeholder="Orbit, Amazon…" /></label>
          <label style={{ width: 110 }}><span>Price</span><input className="field tnum" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="$0.00" /></label>
        </div>
        <label><span>Link</span><input className="field" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://" /></label>
        <label><span>Note</span><textarea className="notes" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you want it, what to wait for" /></label>
      </div>
      <button className="danger" onClick={() => { onRemove(); onClose(); }}>Remove from wishlist</button>
    </Sheet>
  );
}

function NewWantSheet({ onAdd, onClose }) {
  const [film, setFilm] = useState(""); const [year, setYear] = useState(""); const [label, setLabel] = useState("");
  const [st, setSt] = useState(""); const [price, setPrice] = useState(""); const [isSet, setIsSet] = useState(false);
  const add = () => {
    if (!film.trim()) return;
    const p = parseFloat(price.replace(/[$,]/g, ""));
    onAdd({ film: film.trim(), year: isSet ? "" : year.trim(), label: label.trim(), store: st.trim(), price: Number.isFinite(p) ? p : undefined, set: isSet || undefined, kind: "new" });
  };
  return (
    <Sheet title="Add a want" onClose={onClose} right={<button className="link" onClick={add} disabled={!film.trim()} style={{ fontWeight: 600 }}>Add</button>}>
      <div className="want-fields">
        <label><span>Title</span><input className="field" value={film} onChange={(e) => setFilm(e.target.value)} placeholder="Film or box set" autoFocus /></label>
        <div className="chips">
          <button className={"chip" + (!isSet ? " on" : "")} onClick={() => setIsSet(false)}>Film</button>
          <button className={"chip" + (isSet ? " on" : "")} onClick={() => setIsSet(true)}>Box set</button>
        </div>
        {!isSet && <label><span>Year</span><input className="field tnum" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" placeholder="1986" /></label>}
        <label><span>Edition</span><input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Arrow 4K Limited Edition" /></label>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1 }}><span>Store</span><input className="field" value={st} onChange={(e) => setSt(e.target.value)} placeholder="Orbit, Amazon…" /></label>
          <label style={{ width: 110 }}><span>Price</span><input className="field tnum" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="$0.00" /></label>
        </div>
      </div>
    </Sheet>
  );
}

// Tapping a greyed-out film in a director's filmography.
function PeekSheet({ f, onWant, wanted, onOwn, onClose }) {
  return (
    <Sheet title={f.name} onClose={onClose}>
      <div className="want-hero">
        <Poster path={f.posterPath} title={f.name} size="w185" className="want-poster" />
        <div>
          <h2>{f.name}</h2>
          <span className="muted tnum">{f.year} · Not on your shelf</span>
        </div>
      </div>
      <div className="btn-row want-actions">
        {wanted
          ? <button className="btn btn-done" disabled><Icon d={I.check} size={16} sw={2.6} />On your wishlist</button>
          : <button className="btn btn-primary" onClick={() => { onWant(); onClose(); }}><Icon d={I.heart} size={16} sw={2.2} />Add to wishlist</button>}
        <button className="btn btn-outline" onClick={onOwn}>I own it, add to shelf</button>
      </div>
    </Sheet>
  );
}

// ─── FILM PAGE ──────────────────────────────────────────────────────────
function FilmPage({ nav = "in", below = false, onPeek, wanted, deckItem, deckDays = 7, onDeckToggle, film, films, ix, onNight, onBuildAround, allTags, backLabel, onBack, onOpen, onPerson, onUpdate, onLog, onUnlog, onRemove, onPicker, onAddTag, onRemoveTag, onEditCopy, onEditDetails }) {
  const [note, setNote] = useState(film.note);
  const [newTag, setNewTag] = useState(null);
  const [editTags, setEditTags] = useState(false);
  const [editThemes, setEditThemes] = useState(false);
  const [logging, setLogging] = useState(false);
  // Turning a theme on/off undoes an earlier correction first, so a film can always go back to TMDB's answer.
  const toggleTheme = (id) => {
    const u = { add: film.themesAdd || [], off: film.themesOff || [] };
    const on = film.themes.includes(id);
    if (on) {
      if (u.add.includes(id)) onUpdate(film.key, { themesAdd: u.add.filter((x) => x !== id) });
      else onUpdate(film.key, { themesOff: [...u.off, id] });
    } else if (u.off.includes(id)) onUpdate(film.key, { themesOff: u.off.filter((x) => x !== id) });
    else onUpdate(film.key, { themesAdd: [...u.add, id] });
  };
  const [doomed, setDoomed] = useState(null);
  const [armRemove, setArmRemove] = useState(false); // removing takes two taps
  useEffect(() => { if (!armRemove) return; const t = setTimeout(() => setArmRemove(false), 4000); return () => clearTimeout(t); }, [armRemove]);
  const ref = useRef(null);
  useEffect(() => { setNote(film.note); setNewTag(null); setEditTags(false); setEditThemes(false); setDoomed(null); ref.current?.scrollTo(0, 0); }, [film.key]);
  const createTag = () => {
    const t = (newTag || "").trim().replace(/\s+/g, " ");
    if (t) { onAddTag(t); if (!film.rawTags.includes(t)) onUpdate(film.key, { tags: [...film.rawTags, t] }); }
    setNewTag(null);
  };
  const [mountedBelow] = useState(below); // a page that appears underneath (going back two levels) shouldn't slide in
  useSwipeBack(ref, onBack);
  const confirmCopies = () => onUpdate(film.key, { copies: film.copies.map(({ id, ...c }) => ({ ...c, id: newId() })) });

  const today = todayISO();
  const loggedToday = film.lastWatched === today;
  // Scoring partners touches the whole shelf; do it right after the page appears, not before.
  const [pairsWith, setPairsWith] = useState([]);
  useEffect(() => {
    setPairsWith([]);
    if (!ix) return;
    const id = setTimeout(() => setPairsWith(partnersFor(ix, film, 3)), 60);
    return () => clearTimeout(id);
  }, [ix, film.key]);
  const owned = useMemo(() => new Set(films.map((f) => f.tmdb)), [films]);
  const coll = film.collection && COLLECTIONS[film.collection];
  const collOwned = coll ? coll.parts.filter((p) => owned.has(p[0])).length : 0;
  const toggleTag = (t) => onUpdate(film.key, { tags: film.rawTags.includes(t) ? film.rawTags.filter((x) => x !== t) : [...film.rawTags, t] });

  return (
    <div className={stackClass(nav, below, mountedBelow)} ref={ref} role="dialog" aria-label={film.name} aria-hidden={below || undefined}>
      <div className="film-inner">
        <div className="film-hero">
          {film.posterPath && <img className="banner-blur" src={img(film.posterPath, "w92")} alt="" aria-hidden="true" />}
          {film.backdrop && <Banner key={film.backdrop} path={film.backdrop} pos={film.backdropPos} />}
          {film.tmdb && <button className="icon-btn glass banner-edit" onClick={() => onPicker("banner")} aria-label="Change banner"><Icon d={I.image} size={17} sw={2} /></button>}
          <button className="back" onClick={onBack}><Icon d={I.back} size={20} sw={2.4} /><span>{backLabel}</span></button>
        </div>

        <div className="film-head">
          <button onClick={() => onPicker("poster")} aria-label="Change poster" disabled={!film.tmdb}>
            <Poster path={film.posterPath} title={film.name} eager low={["w92", "w185"]} />
          </button>
          <div style={{ minWidth: 0, paddingBottom: 2 }}>
            <h1>{film.name}</h1>
            {film.directors.length > 0 && (
              <button className="who" onClick={() => onPerson(film.directors[0])}>
                {peopleLabel(film.directors)}<Icon d={I.chev} size={13} sw={2.4} />
              </button>
            )}
            <div className="meta tnum">
              <span>{film.year}</span>
              {film.runtime && <span>{runtimeLabel(film.runtime)}</span>}
              {film.rating != null && <span className="accent">{stars(film.rating)}</span>}
            </div>
            <ScoreLine tmdbId={film.tmdb} />
          </div>
        </div>

        <div className="film-body">
          <div className="btn-row">
            <button className={"btn " + (loggedToday ? "btn-done" : "btn-primary")} onClick={() => setLogging(true)}>
              {loggedToday ? <><Icon d={I.check} size={16} sw={2.6} />Watched today</> : "Log a watch"}
            </button>
            <button className={"btn " + (deckItem ? "btn-done deck-on" : "btn-outline")} aria-pressed={!!deckItem} onClick={() => onDeckToggle(film)}>
              <Icon d={deckItem ? I.check : I.plus} size={16} sw={2.6} />On deck
            </button>
          </div>
          {deckItem && <div className="deck-hint">{deckItem.tonight ? "Pinned for tonight. " : `On deck until ${deckUntil(deckItem, deckDays)}. `}Tap again to take it off.</div>}

          <section>
            <div className="stat-head" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>On your shelf</h2>
              <button className="link" onClick={() => onEditCopy(null)}>Add a copy</button>
            </div>
            {film.copiesSuggested && (
              <div className="suggest">
                <span>Filled in from your Letterboxd note, “{film.edition.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim()}”. Check these, then confirm.</span>
                <button className="link" onClick={confirmCopies}>Looks right</button>
              </div>
            )}
            {film.copies.length === 0 && <div className="muted" style={{ fontSize: 15, padding: "6px 0" }}>No copy details yet. Add the format, label and edition you own.</div>}
            {film.copies.map((c) => (
              <button key={c.id} className="list-row copy-row" onClick={() => onEditCopy(c)}>
                <span className={"fmt" + (c.format ? "" : " unknown")}>{c.format || "Format?"}</span>
                <span className="grow" style={{ whiteSpace: "normal" }}>
                  {copyLine(c)}
                  {(c.note || c.region || c.code || c.price != null || c.purchased) && (
                    <span className="muted" style={{ display: "block", fontSize: 13, marginTop: 2 }}>
                      {[c.note, c.region && "Region " + c.region, c.code && `${c.code} code${c.codeRedeemed ? ", redeemed" : ", not redeemed"}`, c.purchased && fmtDate(c.purchased), c.price != null && c.price !== "" && money(c.price)].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="chev"><Icon d={I.chev} size={14} sw={2.4} /></span>
              </button>
            ))}
          </section>

          {film.directors.length > 0 && <DirectorCard film={film} films={films} onOpen={onOpen} onPerson={onPerson} onPeek={onPeek} wanted={wanted} />}

          <dl className="dl">
            <div><dt>Last watched</dt><dd className="tnum">{film.lastWatched ? fmtDate(film.lastWatched) : "Never logged"}</dd></div>
            {film.views.length > 1 && <div><dt>Watched</dt><dd className="tnum">{film.views.length} times</dd></div>}
            {film.dop[0] && <div><dt>Cinematography</dt><dd><button onClick={() => onPerson(film.dop[0])}>{film.dop[0]}</button></dd></div>}
            {film.music.length > 0 && <div><dt>Music</dt><dd><button onClick={() => onPerson(film.music[0])}>{peopleLabel(film.music)}</button></dd></div>}
            {film.cast.length > 0 && <div><dt>Starring</dt><dd>{film.cast.join(", ")}</dd></div>}
            {coll && coll.parts.length > 1 && <div><dt>Series</dt><dd>{coll.name.replace(/ Collection$/, "")} · {collOwned} of {coll.parts.length} owned</dd></div>}
          </dl>

          <div>
            <div className="stat-head" style={{ marginBottom: 8 }}>
              <span className="section-label" style={{ margin: 0 }}>Tags</span>
              {allTags.some(([k]) => !TAGS[k]) && (
                <button className="link" style={{ fontSize: 14 }} onClick={() => { setEditTags(!editTags); setDoomed(null); }}>{editTags ? "Done" : "Edit tags"}</button>
              )}
            </div>
            <div className="tag-row">
              {allTags.map(([k, l]) => {
                const custom = !TAGS[k];
                if (editTags && custom) {
                  const armed = doomed === k;
                  return (
                    <button key={k} className="chip chip-x" style={armed ? { borderColor: "var(--danger)", color: "var(--danger)" } : null}
                      aria-label={armed ? `Delete the tag ${l} from every film` : `Delete the tag ${l}`}
                      onClick={() => (armed ? (onRemoveTag(k), setDoomed(null)) : setDoomed(k))}>
                      {armed ? `Delete "${l}"?` : l}<Icon d={I.close} size={12} sw={2.6} />
                    </button>
                  );
                }
                return <button key={k} className={"chip" + (film.tags.includes(k) ? " on" : "")} aria-pressed={film.tags.includes(k)} onClick={() => toggleTag(k)} disabled={editTags}>{l}</button>;
              })}
              {editTags ? null : newTag == null
                ? <button className="chip chip-x" style={{ color: "var(--accent-text)", borderStyle: "dashed" }} onClick={() => setNewTag("")}><Icon d={I.plus} size={13} sw={2.6} />New tag</button>
                : (
                  <form onSubmit={(e) => { e.preventDefault(); createTag(); }} style={{ display: "flex", gap: 6 }}>
                    <input className="field" style={{ height: 32, width: 170, fontSize: 15 }} value={newTag} onChange={(e) => setNewTag(e.target.value)}
                      onBlur={createTag} placeholder="Watch with Dad" aria-label="New tag name" autoFocus maxLength={32} />
                  </form>
                )}
            </div>
          </div>

          <div>
            <div className="stat-head" style={{ marginBottom: 8 }}>
              <span className="section-label" style={{ margin: 0 }}>Themes</span>
              <button className="link" style={{ fontSize: 14 }} onClick={() => setEditThemes(!editThemes)}>{editThemes ? "Done" : film.themes.length ? "Edit themes" : "Add themes"}</button>
            </div>
            <div className="tag-row">
              {(editThemes ? THEMES : THEMES.filter(([id]) => film.themes.includes(id))).map(([id, label]) => {
                const on = film.themes.includes(id);
                return editThemes
                  ? <button key={id} className={"chip" + (on ? " on" : "")} aria-pressed={on} onClick={() => toggleTheme(id)}>{label}</button>
                  : <span key={id} className="chip theme-chip">{label}</span>;
              })}
              {!editThemes && film.themes.length === 0 && <span className="muted" style={{ fontSize: 14 }}>None yet. Themes feed the Theme filter and Home shelves.</span>}
            </div>
          </div>

          <div>
            <label className="section-label" htmlFor="notes">Notes</label>
            <textarea id="notes" className="notes" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== film.note && onUpdate(film.key, { note })}
              placeholder="Edition details, upgrade plans, who borrowed it" />
          </div>

          {pairsWith.length > 0 && (
            <section>
              <div className="stat-head" style={{ marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Double it up</h2>
                <button className="link" style={{ fontSize: 14 }} onClick={() => onBuildAround(film)}>All partners</button>
              </div>
              {pairsWith.map((p) => {
                const other = p.a.key === film.key ? p.b : p.a;
                return (
                  <button key={p.key} className="film-row" style={{ padding: "6px 0" }} onClick={() => onNight(p)}>
                    <Poster path={other.posterPath} title={other.name} size="w92" className="thumb" />
                    <span className="body">
                      <span className="title">{other.name} <span className="muted tnum" style={{ fontSize: 14 }}>{other.year}</span></span>
                      <span className="meta"><span className="who">{reasonLine(p, 2)}</span></span>
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
            <button className="link" onClick={onEditDetails}>Edit details</button>
            <button className="danger" onClick={() => (armRemove ? (onRemove(film), onBack()) : setArmRemove(true))}>
              {armRemove ? "Tap again to remove it" : "Remove from collection"}
            </button>
          </div>
        </div>
      </div>
      {logging && <LogSheet film={film} onLog={onLog} onUnlog={onUnlog} onClose={() => setLogging(false)} />}
    </div>
  );
}

// ─── LOG A WATCH ────────────────────────────────────────────────────────
// Half-star rating: each star is two tap targets (left half, right half).
function StarPicker({ value, onChange }) {
  const star = <path d="M12 2.8l2.75 5.9 6.45.75-4.78 4.4 1.3 6.37L12 17.02 6.28 20.2l1.3-6.37L2.8 9.45l6.45-.75Z" />;
  return (
    <div className="stars-pick" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = value == null ? 0 : Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="star-cell">
            <svg viewBox="0 0 24 24" className="star-bg" aria-hidden="true">{star}</svg>
            <svg viewBox="0 0 24 24" className="star-fg" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }}>{star}</svg>
            {[n - 0.5, n].map((v, i) => (
              <button key={v} className={"star-hit " + (i ? "r" : "l")} aria-label={`${v} stars`} aria-pressed={value === v}
                onClick={() => onChange(value === v ? null : v)} />
            ))}
          </span>
        );
      })}
    </div>
  );
}

function LogSheet({ film, onLog, onUnlog, onClose }) {
  const today = todayISO();
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");
  const [date, setDate] = useState(today);
  const [rating, setRating] = useState(film.rating ?? null);
  const watched = film.diary.slice().reverse();
  const already = film.diary.some((e) => e.date === date);
  return (
    <Sheet title="Log a watch" onClose={onClose} left={<button className="left" onClick={onClose}>Cancel</button>} right={<span />}
      foot={<button className="btn btn-primary" onClick={() => { onLog(film.key, date, rating); onClose(); }}>{already ? "Update this watch" : "Log watch"}</button>}>
      <div className="muted" style={{ fontSize: 14, marginTop: -4 }}>{film.name} ({film.year})</div>
      <section className="stat-section" style={{ gap: 8 }}>
        <span className="field-label" style={{ margin: 0 }}>Watched on</span>
        <div className="tag-row">
          <button className={"chip" + (date === today ? " on" : "")} onClick={() => setDate(today)}>Today</button>
          <button className={"chip" + (date === yesterday ? " on" : "")} onClick={() => setDate(yesterday)}>Yesterday</button>
          <label className={"chip date-chip" + (date !== today && date !== yesterday ? " on" : "")}>
            {date !== today && date !== yesterday ? fmtDate(date) : "Pick a date"}
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick a date" />
          </label>
        </div>
      </section>
      <section className="stat-section" style={{ gap: 8 }}>
        <div className="stat-head">
          <span className="field-label" style={{ margin: 0 }}>Rating</span>
          <span className="muted tnum" style={{ fontSize: 13 }}>{rating == null ? "Not rated" : rating + " / 5"}</span>
        </div>
        <StarPicker value={rating} onChange={setRating} />
        <span className="muted" style={{ fontSize: 12 }}>Tap the left or right side of a star for halves. Tap your rating again to clear it. This becomes the film's rating in the app.</span>
      </section>
      {watched.length > 0 && (
        <section className="stat-section" style={{ gap: 0 }}>
          <span className="field-label">Logged here</span>
          {watched.map((e) => (
            <div key={e.date} className="list-row">
              <span className="grow tnum">{fmtDate(e.date)}{e.rating != null && <span className="accent"> · {stars(e.rating)}</span>}</span>
              <button style={{ fontSize: 14, color: "var(--danger)" }} onClick={() => onUnlog(film.key, e.date)}>Remove</button>
            </div>
          ))}
        </section>
      )}
    </Sheet>
  );
}

// Poster and banner art from TMDB. Posters: English first, then textless. Banners: textless first.
function PosterPicker({ film, startTab = "poster", onPick, onClose }) {
  const [tab, setTab] = useState(startTab);
  const [art, setArt] = useState(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(32);
  useEffect(() => {
    let dead = false;
    tmdb(`/${film.tmdbType || "movie"}/${film.tmdb}/images`)
      .then((res) => {
        if (dead) return;
        const byVotes = (a, b) => b.vote_average - a.vote_average || b.vote_count - a.vote_count;
        const pRank = (p) => (p.iso_639_1 === "en" ? 0 : p.iso_639_1 == null ? 1 : 2);
        const bRank = (p) => (p.iso_639_1 == null ? 0 : p.iso_639_1 === "en" ? 1 : 2);
        setArt({
          poster: (res.posters || []).slice().sort((a, b) => pRank(a) - pRank(b) || byVotes(a, b)),
          banner: (res.backdrops || []).slice().sort((a, b) => bRank(a) - bRank(b) || byVotes(a, b)),
        });
      })
      .catch((e) => !dead && setError(e.message));
    return () => { dead = true; };
  }, [film.tmdb, film.tmdbType]);
  useEffect(() => setShown(tab === "poster" ? 32 : 16), [tab]);
  const list = art ? art[tab] : null;
  const current = tab === "poster" ? film.posterPath : film.backdrop;
  const custom = tab === "poster" ? film.customPoster : film.customBackdrop;
  const badge = (p) => (p.iso_639_1 == null ? "No text" : p.iso_639_1 === "en" ? null : p.iso_639_1.toUpperCase());
  const noun = tab === "poster" ? "posters" : "banners";

  return (
    <Sheet title={tab === "poster" ? "Choose a poster" : "Choose a banner"} onClose={onClose} tall
      left={custom ? <button className="left" onClick={() => onPick(tab, null)}>Use default</button> : null}>
      <div className="seg" role="tablist" aria-label="Artwork">
        {[["poster", "Poster"], ["banner", "Banner"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "banner" && film.backdrop && (
        <div className="banner-preview">
          <img src={img(film.backdrop, "w780")} alt="" style={{ objectPosition: "center " + film.backdropPos }} />
          <div className="seg banner-pos" role="group" aria-label="Banner framing">
            {[["top", "Top"], ["center", "Middle"], ["bottom", "Bottom"]].map(([k, l]) => (
              <button key={k} className={film.backdropPos === k ? "on" : ""} aria-pressed={film.backdropPos === k} onClick={() => onPick("pos", k)}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <div className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        {list ? `${list.length} ${noun} on TMDB. ${tab === "poster" ? "English first, then textless." : "Textless first, which suits the banner best."}` : error ? "" : "Loading artwork…"}
      </div>
      {error && <div className="empty">Couldn't load artwork: {error}</div>}
      {list && list.length === 0 && <div className="empty">TMDB has no {noun} for this film yet.</div>}
      {list && list.length > 0 && (
        <div className={tab === "poster" ? "picker-grid" : "picker-grid wide"}>
          {list.slice(0, shown).map((p) => {
            const on = p.file_path === current;
            return (
              <button key={p.file_path} className={"picker-item" + (on ? " on" : "")} aria-pressed={on} aria-label={tab === "poster" ? "Use this poster" : "Use this banner"} onClick={() => onPick(tab, p.file_path)}>
                {tab === "poster" ? <Poster path={p.file_path} size="w185" /> : <img className="banner-thumb" src={img(p.file_path, "w300")} alt="" loading="lazy" />}
                {badge(p) && <span className="picker-badge">{badge(p)}</span>}
                {on && <span className="picker-check"><Icon d={I.check} size={12} sw={3} /></span>}
              </button>
            );
          })}
        </div>
      )}
      {list && shown < list.length && <button className="btn btn-outline" onClick={() => setShown(shown + (tab === "poster" ? 32 : 16))}>Show more {noun}</button>}
    </Sheet>
  );
}

// ─── EDIT A COPY ────────────────────────────────────────────────────────
function CopySheet({ film, copy, labels, onNewLabel, onSave, onClose }) {
  const [allLabels, setAllLabels] = useState(false);
  const [newLabel, setNewLabel] = useState(null);
  const isNew = !copy;
  const [c, setC] = useState(() => copy ? { ...copy, package: pkgsOf(copy), price: copy.price ?? "" } : { id: newId(), format: "", package: [], label: "", region: "", purchased: "", price: "", note: "" });
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const clean = (x) => {
    const out = { ...x, id: x.id.startsWith("s") ? newId() : x.id, label: canonicalLabel((x.label || "").trim()), note: (x.note || "").trim() };
    const n = parseFloat(String(x.price).replace(/[$,]/g, ""));
    if (isNaN(n)) delete out.price; else out.price = n;
    if (!out.purchased) delete out.purchased;
    if (!out.region || isDigital(out)) delete out.region;
    if (isDigital(out)) { out.package = []; delete out.code; delete out.codeRedeemed; }
    if (!out.code) { delete out.code; delete out.codeRedeemed; }
    return out;
  };
  const others = film.copies.map((x) => (x.id.startsWith("s") ? { ...x, id: newId() } : x));
  const save = () => {
    const list = isNew ? [...others, clean(c)] : film.copies.map((x) => (x.id === copy.id ? clean(c) : x.id.startsWith("s") ? { ...x, id: newId() } : x));
    onSave(list);
  };
  const remove = () => onSave(film.copies.filter((x) => x.id !== copy.id).map((x) => (x.id.startsWith("s") ? { ...x, id: newId() } : x)));
  const Chips = ({ k, opts, allowNone }) => (
    <div className="tag-row">
      {opts.map((o) => (
        <button key={o} type="button" className={"chip" + (c[k] === o ? " on" : "")} aria-pressed={c[k] === o}
          onClick={() => set(k, c[k] === o && allowNone ? "" : o)}>{o}</button>
      ))}
    </div>
  );
  return (
    <Sheet title={isNew ? "Add a copy" : "Edit copy"} onClose={onClose} tall
      left={<button className="left" onClick={onClose}>Cancel</button>}
      right={<button className="right" onClick={save}>Save</button>}
      foot={!isNew && <button className="btn btn-outline" style={{ color: "var(--danger)" }} onClick={remove}>Delete this copy</button>}>
      <div className="muted" style={{ fontSize: 14, marginTop: -4 }}>{film.name} ({film.year})</div>
      <div><span className="field-label">Format</span><Chips k="format" opts={FORMATS} allowNone /></div>
      {isDigital(c) ? null : (
        <div>
          <span className="field-label">Package <span className="muted">· pick all that apply</span></span>
          <div className="tag-row">
            {PACKAGES.map((o) => {
              const on = o === "Standard" ? !c.package.length : c.package.includes(o);
              const toggle = () => set("package", o === "Standard" ? [] : PACKAGES.filter((p) => p !== "Standard" && (p === o ? !on : c.package.includes(p))));
              return <button key={o} type="button" className={"chip" + (on ? " on" : "")} aria-pressed={on} onClick={toggle}>{o}</button>;
            })}
          </div>
        </div>
      )}
      <div>
        <span className="field-label">Label or distributor</span>
        <div className="tag-row">
          {(() => {
            const pool = c.label && !labels.includes(c.label) ? [c.label, ...labels] : labels;
            const shown = allLabels ? pool : pool.filter((l, i) => i < 12 || l === c.label);
            return (
              <>
                {shown.map((l) => (
                  <button key={l} type="button" className={"chip" + (c.label === l ? " on" : "")} aria-pressed={c.label === l} onClick={() => set("label", c.label === l ? "" : l)}>{l}</button>
                ))}
                {!allLabels && pool.length > shown.length && <button type="button" className="chip" style={{ color: "var(--accent-text)" }} onClick={() => setAllLabels(true)}>All {pool.length}</button>}
              </>
            );
          })()}
          {newLabel == null ? (
            <button type="button" className="chip chip-x" style={{ color: "var(--accent-text)", borderStyle: "dashed" }} onClick={() => setNewLabel("")}><Icon d={I.plus} size={13} sw={2.6} />New label</button>
          ) : (
            <form style={{ display: "flex" }} onSubmit={(e) => { e.preventDefault(); e.currentTarget.querySelector("input").blur(); }}>
              <input id="copy-label" className="field" style={{ height: 32, width: 190, fontSize: 15 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} autoFocus maxLength={40}
                placeholder="e.g. Powerhouse Films" aria-label="New label name"
                onBlur={() => { const n = canonicalLabel(newLabel.trim().replace(/\s+/g, " ")); if (n) { onNewLabel(n); set("label", n); } setNewLabel(null); }} />
            </form>
          )}
        </div>
      </div>
      {isDigital(c) ? null : <div><span className="field-label">Region</span><Chips k="region" opts={REGIONS} allowNone /></div>}
      {c.format && !isDigital(c) && (
        <div>
          <span className="field-label">Digital code in the case</span>
          <div className="tag-row">
            <Chips k="code" opts={CODE_QUALITIES} allowNone />
            {c.code && (
              <button type="button" className={"chip" + (c.codeRedeemed ? " on" : "")} aria-pressed={!!c.codeRedeemed} onClick={() => set("codeRedeemed", !c.codeRedeemed)}>
                {c.codeRedeemed ? "Redeemed" : "Not redeemed"}
              </button>
            )}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="field-label" htmlFor="copy-date">Bought on</label>
          <input id="copy-date" className="field" type="date" value={c.purchased || ""} onChange={(e) => set("purchased", e.target.value)} />
        </div>
        <div style={{ width: 120, flexShrink: 0 }}>
          <label className="field-label" htmlFor="copy-price">Price paid</label>
          <input id="copy-price" className="field" inputMode="decimal" value={c.price} onChange={(e) => set("price", e.target.value)} placeholder="$34.99" />
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="copy-note">Note</label>
        <input id="copy-note" className="field" value={c.note || ""} onChange={(e) => set("note", e.target.value)} placeholder="Spine #1127, slipcover, signed…" />
      </div>
    </Sheet>
  );
}

// ─── EDIT DETAILS: rating override, fix the TMDB match ─────────────────
const MATCH_FIELDS = ["tmdb", "runtime", "genres", "directors", "dop", "music", "cast", "countries", "lang", "keywords", "collection", "poster", "backdrop", "logo"];
function DetailsSheet({ film, onUpdate, onClose }) {
  const [rating, setRating] = useState(film.ratingSet ? String(film.rating ?? "none") : "lb");
  const [q, setQ] = useState(film.name);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!searching || q.trim().length < 2) return;
    let dead = false;
    const t = setTimeout(() => {
      tmdb("/search/movie", { query: q.trim() }).then((r) => !dead && setResults((r.results || []).slice(0, 8))).catch((e) => !dead && setError(e.message));
    }, 300);
    return () => { dead = true; clearTimeout(t); };
  }, [q, searching]);

  const saveRating = (v) => {
    setRating(v);
    onUpdate(film.key, { rating: v === "lb" ? undefined : v === "none" ? null : parseFloat(v) });
  };
  const pick = async (r) => {
    setBusy(true); setError("");
    try {
      const d = await tmdb(`/movie/${r.id}`, { append_to_response: "credits,images,keywords", include_image_language: "en,null" });
      const shaped = shapeTmdbMovie(d);
      const match = Object.fromEntries(MATCH_FIELDS.map((k) => [k, shaped[k] ?? null]));
      onUpdate(film.key, { match, poster: undefined });
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Sheet title="Edit details" onClose={onClose} tall>
      <div>
        <label className="field-label" htmlFor="rating-sel">Your rating</label>
        <select id="rating-sel" className="field" value={rating} onChange={(e) => saveRating(e.target.value)}>
          <option value="lb">{film.lbRating != null ? `From Letterboxd (${film.lbRating} stars)` : "From Letterboxd (not rated)"}</option>
          {[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((r) => <option key={r} value={String(r)}>{r} stars</option>)}
          <option value="none">Not rated</option>
        </select>
      </div>
      <div>
        <span className="field-label">Film data</span>
        <div className="list-row" style={{ borderTop: "0.5px solid var(--rule)" }}>
          <span className="grow" style={{ whiteSpace: "normal" }}>
            Matched to TMDB #{film.tmdb || "none"}{film.directors[0] ? ` · ${film.directors[0]}` : ""}{film.runtime ? ` · ${runtimeLabel(film.runtime)}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
          {!searching && <button className="link" onClick={() => setSearching(true)}>Wrong film? Fix the match</button>}
          {film.matched && <button className="link" onClick={() => { onUpdate(film.key, { match: undefined, poster: undefined }); onClose(); }}>Undo my fix</button>}
        </div>
      </div>
      {searching && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input className="field" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search TMDB" autoFocus />
          {(results || []).map((r) => (
            <button key={r.id} className="result" disabled={busy} onClick={() => pick(r)}>
              <Poster path={r.poster_path} title={r.title} size="w92" />
              <div style={{ minWidth: 0 }}>
                <div className="t">{r.title}</div>
                <div className="s">{(r.release_date || "").slice(0, 4) || "Year unknown"}{r.id === film.tmdb ? " · current match" : ""}</div>
              </div>
            </button>
          ))}
          {results && results.length === 0 && <div className="muted" style={{ fontSize: 14 }}>No matches on TMDB.</div>}
        </div>
      )}
      {error && <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div>}
      <p className="foot">Your title, year, copies, tags and notes stay as they are. Only the poster, credits and other TMDB data change.</p>
    </Sheet>
  );
}

// ─── ADD FILM ───────────────────────────────────────────────────────────
function AddSheet({ prefill, existing, onAdd, onClose }) {
  const [q, setQ] = useState(prefill?.name || "");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState(null);
  const [manual, setManual] = useState(false);
  const [year, setYear] = useState(prefill?.year || "");
  const [edition, setEdition] = useState(prefill?.label || "");
  const [rating, setRating] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (manual || chosen || q.trim().length < 2) { setResults(null); return; }
    let dead = false;
    const t = setTimeout(() => {
      tmdb("/search/movie", { query: q.trim() })
        .then((r) => { if (!dead) { setResults((r.results || []).slice(0, 8)); setError(""); } })
        .catch((e) => !dead && setError(e.message));
    }, 300);
    return () => { dead = true; clearTimeout(t); };
  }, [q, manual, chosen]);

  const dupe = (name, yr, id) => existing.some((f) => (id && f.tmdb === id) || (f.name === name && f.year === yr));
  const base = () => ({ edition: edition.trim(), rating: rating === "" ? null : parseFloat(rating), lastWatched: null });

  const save = async () => {
    if (manual) {
      if (!q.trim()) return setError("Enter a title.");
      if (!/^\d{4}$/.test(year.trim())) return setError("Enter a four-digit release year.");
      if (dupe(q.trim(), year.trim())) return setError("This film is already on your shelf.");
      onAdd({ name: q.trim(), year: year.trim(), ...base() });
      return onClose();
    }
    const yr = (chosen.release_date || "").slice(0, 4);
    if (dupe(chosen.title, yr, chosen.id)) return setError("This film is already on your shelf.");
    setSaving(true);
    let details = { tmdb: chosen.id, poster: chosen.poster_path || undefined, backdrop: chosen.backdrop_path || undefined };
    try {
      const d = await tmdb(`/movie/${chosen.id}`, { append_to_response: "credits,images,keywords", include_image_language: "en,null" });
      details = shapeTmdbMovie(d);
    } catch {}
    onAdd({ name: chosen.title, year: yr, ...details, ...base() });
    onClose();
  };

  const form = (
    <>
      <div>
        <label className="field-label" htmlFor="edition">Edition</label>
        <input id="edition" className="field" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="e.g. Criterion 4K, steelbook" />
      </div>
      <div>
        <label className="field-label" htmlFor="rating">Your rating</label>
        <select id="rating" className="field" value={rating} onChange={(e) => setRating(e.target.value)}>
          <option value="">Not rated</option>
          {[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((r) => <option key={r} value={r}>{r} stars</option>)}
        </select>
      </div>
    </>
  );

  return (
    <Sheet title="Add a film" onClose={onClose} tall
      left={<button className="left" onClick={onClose}>Cancel</button>} right={<span />}
      foot={(chosen || manual) && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Adding…" : "Add to shelf"}</button>}>
      {chosen ? (
        <>
          <div className="result">
            <Poster path={chosen.poster_path} title={chosen.title} size="w92" />
            <div style={{ flex: 1 }}><div className="t">{chosen.title}</div><div className="s">{(chosen.release_date || "").slice(0, 4)}</div></div>
            <button className="link" onClick={() => setChosen(null)}>Change</button>
          </div>
          {form}
        </>
      ) : (
        <>
          <div>
            <label className="field-label" htmlFor="title">{manual ? "Title" : "Search TMDB"}</label>
            <input id="title" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="The Conversation" autoFocus />
          </div>
          {manual ? (
            <>
              <div>
                <label className="field-label" htmlFor="year">Year</label>
                <input id="year" className="field" value={year} onChange={(e) => setYear(e.target.value)} placeholder="1974" inputMode="numeric" />
              </div>
              {form}
            </>
          ) : (
            <div>
              {results && results.length === 0 && <div className="empty" style={{ padding: "12px 0" }}>No matches on TMDB.</div>}
              {(results || []).map((r) => (
                <button key={r.id} className="result" onClick={() => { setChosen(r); setError(""); }}>
                  <Poster path={r.poster_path} title={r.title} size="w92" />
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{r.title}</div>
                    <div className="s">{(r.release_date || "").slice(0, 4) || "Year unknown"}{dupe(r.title, (r.release_date || "").slice(0, 4), r.id) ? " · already on your shelf" : ""}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => { setManual(!manual); setError(""); }}>
            {manual ? "Search TMDB instead" : "Can't find it? Add it by hand"}
          </button>
        </>
      )}
      {error && <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div>}
    </Sheet>
  );
}

// ─── STATS ──────────────────────────────────────────────────────────────
function Bars({ data, height, sel, setSel, label }) {
  const max = Math.max(...data.map((d) => d.n), 1);
  return (
    <>
      <div className="bars" role="group" aria-label={label} style={{ height }}>
        {data.map((d, i) => (
          <button key={d.label} className={i === sel ? "on" : ""} onClick={() => setSel(i)} aria-label={`${d.label}: ${d.n} films`} aria-pressed={i === sel}>
            <i style={{ height: (d.n / max) * 100 + "%" }} />
          </button>
        ))}
      </div>
      <div className="bar-labels">{data.map((d) => <span key={d.label}>{d.short}</span>)}</div>
    </>
  );
}

function Stats({ films, onPerson, onLabel }) {
  const year = thisYear();
  const s = useMemo(() => {
    const rated = films.filter((f) => f.rating != null);
    const avg = rated.reduce((a, f) => a + f.rating, 0) / (rated.length || 1);
    const decades = [];
    for (let d = 1920; d <= 2020; d += 10) {
      const n = films.filter((f) => f.yearNum >= d && f.yearNum < d + 10).length;
      if (n) decades.push({ label: d + "s", short: String(d).slice(2), n });
    }
    const ratings = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((r) => ({ label: r + " stars", short: String(r), n: rated.filter((f) => f.rating === r).length }))
      .filter((r, i, all) => r.n || all.slice(0, i).some((x) => x.n));
    const yr = String(year);
    const thisYearFilms = films.filter((f) => f.views.some((v) => v.startsWith(yr)));
    const viewings = films.reduce((a, f) => a + f.views.filter((v) => v.startsWith(yr)).length, 0);
    const mostWatched = films.filter((f) => f.views.length > 1).sort((a, b) => b.views.length - a.views.length || a.sortKey.localeCompare(b.sortKey)).slice(0, 5);
    const tally = (pick) => {
      const m = new Map();
      films.forEach((f) => pick(f).forEach((n) => m.set(n, (m.get(n) || 0) + 1)));
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    };
    const minutes = films.reduce((a, f) => a + (f.runtime || 0), 0);
    const owned = new Set(films.map((f) => f.tmdb));
    const series = Object.values(COLLECTIONS).map((c) => {
      const released = c.parts.filter((p) => p[2] && +p[2] < year);
      return { name: c.name.replace(/ Collection$/, ""), have: c.parts.filter((p) => owned.has(p[0])).length, total: c.parts.length, missing: released.filter((p) => !owned.has(p[0])) };
    }).filter((c) => c.total > 1);
    return {
      rated, avg, decades, ratings, thisYearFilms, viewings, mostWatched,
      directors: tally((f) => f.directors.slice(0, 1)).slice(0, 6),
      dops: tally((f) => f.dop).slice(0, 3),
      composers: tally((f) => f.music.slice(0, 1)).slice(0, 3),
      hours: Math.round(minutes / 60),
      never: films.filter((f) => !f.lastWatched).length,
      complete: series.filter((c) => c.have === c.total).length,
      almost: series.filter((c) => c.have >= 2 && c.missing.length > 0).sort((a, b) => b.have / b.total - a.have / a.total).slice(0, 5),
      editions: films.filter((f) => f.special).length,
      withCopies: films.filter((f) => f.copies.length && !f.copiesSuggested).length,
      formats: FORMATS.map((fm) => [fm, films.reduce((a, f) => a + f.copies.filter((c) => c.format === fm).length, 0)]).filter(([, n]) => n),
      labels: tally((f) => [...new Set(f.copies.map((c) => c.label).filter(Boolean))]).slice(0, 6),
      priced: films.flatMap((f) => f.copies).filter((c) => c.price != null && c.price !== ""),
      k4: films.filter((f) => f.badges.includes("4K")).length,
      steel: films.filter((f) => f.badges.includes("Steelbook")).length,
    };
  }, [films, year]);
  const decDefault = s.decades.reduce((b, d, i, a) => (d.n > a[b].n ? i : b), 0);
  const rateDefault = s.ratings.reduce((b, d, i, a) => (d.n > a[b].n ? i : b), 0);
  const [dec, setDec] = useState(null);
  const [rate, setRate] = useState(null);
  const decSel = dec ?? decDefault, rateSel = rate ?? rateDefault;

  return (
    <div className="page stats">
      <div className="page-head"><h1>Stats</h1></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: -16 }}>
        <div className="strip four">
          <div><b>{films.length}</b><span>Films</span></div>
          <div><b>{films.filter((f) => f.rating === 5).length}</b><span>Five stars</span></div>
          <div><b>{s.avg.toFixed(1)}★</b><span>Average</span></div>
          <div><b>{s.never}</b><span>Never logged</span></div>
        </div>
        <p className="stat-lede">You rate the films you own <b>{s.avg.toFixed(2)}</b> on average, against <b>{META.allRated.avg}</b> across all {META.allRated.count.toLocaleString()} films you've rated. The shelf is curated, not hoarded.</p>
      </div>

      <section className="stat-section">
        <div className="stat-head"><h2>By decade</h2><span className="tnum">{s.decades[decSel].label} · {s.decades[decSel].n} films</span></div>
        <Bars data={s.decades} height={124} sel={decSel} setSel={setDec} label="Films by decade" />
      </section>

      <section className="stat-section">
        <div className="stat-head"><h2>How you rated what you own</h2></div>
        <span className="muted tnum" style={{ fontSize: 14, marginTop: -6 }}>{s.ratings[rateSel].label} · {s.ratings[rateSel].n} films</span>
        <Bars data={s.ratings} height={96} sel={rateSel} setSel={setRate} label="Owned films by your rating" />
        <span className="muted" style={{ fontSize: 13 }}>{films.length - s.rated.length} owned films have no rating.</span>
      </section>

      <section className="stat-section">
        <h2>{year} from your shelf</h2>
        <div className="meter" aria-hidden="true"><i style={{ width: (s.thisYearFilms.length / films.length) * 100 + "%" }} /></div>
        <span style={{ fontSize: 15, color: "rgba(235,235,245,0.82)" }}><b style={{ color: "var(--label)" }}>{s.thisYearFilms.length}</b> of {films.length} films watched this year, across {s.viewings} viewings.</span>
      </section>

      {s.mostWatched.length > 0 && (
        <section className="stat-section" style={{ gap: 0 }}>
          <h2 style={{ marginBottom: 6 }}>Most watched from your shelf</h2>
          {s.mostWatched.map((f, i) => (
            <div className="list-row" key={f.key}><span className="rank tnum">{i + 1}</span><span className="grow">{f.name}</span><span className="muted tnum">{f.views.length} times</span></div>
          ))}
        </section>
      )}

      <section className="stat-section" style={{ gap: 0 }}>
        <h2 style={{ marginBottom: 6 }}>Most on your shelf</h2>
        {s.directors.map(([name, n]) => (
          <button className="list-row" key={name} onClick={() => onPerson(name)} style={{ width: "100%", textAlign: "left" }}>
            <span className="grow">{name}</span><span className="muted tnum">{n} films</span>
          </button>
        ))}
        <span className="muted" style={{ fontSize: 13, marginTop: 10 }}>Laid end to end, the shelf runs {s.hours.toLocaleString()} hours: {Math.round(s.hours / 24)} days without sleeping.</span>
      </section>

      <section className="stat-section" style={{ gap: 0 }}>
        <h2 style={{ marginBottom: 6 }}>Behind the camera</h2>
        {s.dops.map(([name, n]) => (
          <button className="list-row" key={"d" + name} onClick={() => onPerson(name)} style={{ width: "100%", textAlign: "left" }}>
            <span className="grow">{name} <span className="muted">· cinematography</span></span><span className="muted tnum">{n}</span>
          </button>
        ))}
        {s.composers.map(([name, n]) => (
          <button className="list-row" key={"c" + name} onClick={() => onPerson(name)} style={{ width: "100%", textAlign: "left" }}>
            <span className="grow">{name} <span className="muted">· music</span></span><span className="muted tnum">{n}</span>
          </button>
        ))}
      </section>

      <section className="stat-section" style={{ gap: 0 }}>
        <h2>Directors you've ranked</h2>
        <span className="muted" style={{ fontSize: 13, margin: "2px 0 8px" }}>How many of the films you've seen are on the shelf</span>
        {META.rankedDirectors.map((d) => (
          <div key={d.name} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--rule-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}><span>{d.name}</span><span className="muted tnum">{d.owned} of {d.seen}</span></div>
            <div className="meter thin" aria-hidden="true"><i style={{ width: (d.owned / d.seen) * 100 + "%" }} /></div>
          </div>
        ))}
      </section>

      <CriticsSection films={films} />

      <section className="stat-section" style={{ gap: 0 }}>
        <h2 style={{ marginBottom: 6 }}>Series</h2>
        <div className="list-row"><span className="grow muted">Complete on your shelf</span><span className="tnum">{s.complete}</span></div>
        {s.almost.map((c) => (
          <div className="list-row" key={c.name} style={{ alignItems: "flex-start" }}>
            <span className="grow" style={{ whiteSpace: "normal" }}>{c.name}<br /><span className="muted" style={{ fontSize: 13 }}>Missing {c.missing.map((p) => `${p[1]} (${p[2]})`).join(", ")}</span></span>
            <span className="muted tnum">{c.have} of {c.total}</span>
          </div>
        ))}
      </section>

      <section className="stat-section" style={{ gap: 0 }}>
        <h2 style={{ marginBottom: 6 }}>Your copies</h2>
        <div className="list-row"><span className="grow muted">Films with copy details</span><span className="tnum">{s.withCopies} of {films.length}</span></div>
        {s.formats.map(([fm, n]) => <div className="list-row" key={fm}><span className="grow muted">{fm} discs</span><span className="tnum">{n}</span></div>)}
        {s.labels.map(([l, n]) => (
          <button className="list-row" key={l} onClick={() => onLabel(l)} style={{ width: "100%", textAlign: "left" }}><span className="grow">{l}</span><span className="muted tnum">{n} films</span></button>
        ))}
        {s.priced.length > 0 && (
          <div className="list-row"><span className="grow muted">What the shelf cost you, {s.priced.length} priced {s.priced.length === 1 ? "copy" : "copies"}</span><span className="tnum accent">{money(s.priced.reduce((a, c) => a + c.price, 0))}</span></div>
        )}
        {s.withCopies < films.length && <span className="muted" style={{ fontSize: 13, marginTop: 8 }}>Formats and labels only count films you've filled in. Add copies from any film's page.</span>}
      </section>

      <section className="stat-section" style={{ gap: 0 }}>
        <h2 style={{ marginBottom: 6 }}>Editions and gaps</h2>
        <div className="list-row"><span className="grow muted">Special editions</span><span className="tnum">{s.editions}</span></div>
        <div className="list-row"><span className="grow muted">Include a 4K disc</span><span className="tnum">{s.k4}</span></div>
        <div className="list-row"><span className="grow muted">Include a steelbook</span><span className="tnum">{s.steel}</span></div>
        <div className="list-row"><span className="grow muted">Rated 5 stars, not on the shelf</span><span className="tnum accent">{META.fiveStarNotOwned}</span></div>
      </section>

      <p className="foot">Watch history and rankings as of your Letterboxd export on {fmtDate(META.exportedAt)}, plus anything you've logged here since.</p>
    </div>
  );
}

// ─── DOUBLES ────────────────────────────────────────────────────────────
const FINISH = [[22, "10 PM"], [23, "11 PM"], [24, "Midnight"], [25, "1 AM"]];
const runtimeShort = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

function PairCard({ p, finish, onOpen }) {
  const [brk] = usePref("shelf-break-min", 15);
  const plan = nightPlan(p.a, p.b, finish, brk);
  return (
    <button className="dbl-card" onClick={() => onOpen(p)}>
      <div className="dbl-posters">
        {[p.a, p.b].map((f) => <Poster key={f.key} path={f.posterPath} title={f.name} size="w185" />)}
      </div>
      <div className="dbl-body">
        <div className="dbl-titles">
          <span>{p.a.name} <span className="muted tnum">{p.a.year}</span></span>
          <span>{p.b.name} <span className="muted tnum">{p.b.year}</span></span>
        </div>
        <div className="dbl-why">
          {p.reasons.slice(0, 3).map((r) => <span key={r.text} className={"why why-" + r.kind}>{r.text}</span>)}
        </div>
        {plan && <div className="dbl-plan tnum">{runtimeShort(plan.total)} · start by {plan.start}</div>}
      </div>
    </button>
  );
}

function Doubles({ films, ix, programs, view, setView, anchor, setAnchor, onNight, finish, toTop = (smooth) => window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" }) }) {
  const best = useMemo(() => bestPairs(ix), [ix]);
  const [seed, setSeed] = useState(0);
  const [shown, setShown] = useState(10);
  const feed = useMemo(() => shuffled(best, rng(hashStr(todayISO()) + seed * 7919)), [best, seed]);
  const [q, setQ] = useState("");
  const anchorFilm = anchor ? films.find((f) => f.key === anchor) : null;
  const partners = useMemo(() => (anchorFilm ? partnersFor(ix, anchorFilm, 40) : []), [ix, anchorFilm]);
  const query = q.trim().toLowerCase();
  const matches = query ? films.filter((f) => f.name.toLowerCase().includes(query) || f.directors.some((d) => d.toLowerCase().includes(query))).slice(0, 30) : [];
  const recent = useMemo(() => films.filter((f) => f.lastWatched).sort((a, b) => b.lastWatched.localeCompare(a.lastWatched)).slice(0, 8), [films]);
  const byKey = useMemo(() => new Map(films.map((f) => [f.key, f])), [films]);
  const saved = programs.map((pr) => ({ pr, a: byKey.get(pr.a), b: byKey.get(pr.b) })).filter((x) => x.a && x.b);
  const pick = (f) => { setAnchor(f.key); setQ(""); toTop(); };

  return (
    <div className="page">
      <div className="page-head"><h1>Double features</h1></div>
      <div className="seg" role="tablist" aria-label="Double features">
        {[["feed", "For you"], ["build", "Build"], ["saved", "Saved" + (saved.length ? " " + saved.length : "")]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>

      {view === "feed" && (
        <>
          <div className="lib-bar">
            <span className="muted">Pairs from your shelf, matched on themes, crew, cast and era.</span>
            <button className="filter-btn" style={{ fontSize: 14, flexShrink: 0 }} onClick={() => { setSeed(seed + 1); setShown(10); toTop(true); }}>
              <Icon d={I.shuffle} size={15} sw={2.2} />Shuffle
            </button>
          </div>
          {feed.length === 0 && <div className="empty">Not enough overlap on the shelf to pair anything yet.</div>}
          <div className="dbl-list">
            {feed.slice(0, shown).map((p) => <PairCard key={p.key} p={p} finish={finish} onOpen={onNight} />)}
          </div>
          {shown < feed.length && <button className="btn btn-outline" onClick={() => setShown(shown + 10)}>Show more pairs</button>}
        </>
      )}

      {view === "build" && (
        <>
          {anchorFilm ? (
            <div className="anchor">
              <Poster path={anchorFilm.posterPath} title={anchorFilm.name} size="w185" />
              <div className="grow">
                <span className="muted" style={{ fontSize: 13 }}>Starting with</span>
                <strong>{anchorFilm.name}</strong>
                <span className="muted tnum" style={{ fontSize: 14 }}>{[anchorFilm.year, anchorFilm.directors[0], runtimeLabel(anchorFilm.runtime)].filter(Boolean).join(" · ")}</span>
              </div>
              <button className="link" onClick={() => setAnchor(null)}>Change</button>
            </div>
          ) : (
            <label className="search">
              <Icon d={I.search} size={16} sw={2.2} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pick a film to build around" aria-label="Pick a film to build around" />
            </label>
          )}

          {!anchorFilm && !query && (
            <div className="stat-section" style={{ gap: 0 }}>
              <div className="section-label">Recently watched</div>
              {recent.map((f) => (
                <button key={f.key} className="film-row" style={{ padding: "6px 0" }} onClick={() => pick(f)}>
                  <Poster path={f.posterPath} title={f.name} size="w92" className="thumb" />
                  <span className="body"><span className="title">{f.name}</span><span className="meta tnum"><span>{f.year}</span><span className="who">{f.directors[0]}</span></span></span>
                </button>
              ))}
            </div>
          )}
          {!anchorFilm && query && (
            <div>
              {matches.length === 0 && <div className="empty">Nothing on the shelf matches "{q.trim()}".</div>}
              {matches.map((f) => (
                <button key={f.key} className="film-row" style={{ padding: "6px 0" }} onClick={() => pick(f)}>
                  <Poster path={f.posterPath} title={f.name} size="w92" className="thumb" />
                  <span className="body"><span className="title">{f.name}</span><span className="meta tnum"><span>{f.year}</span><span className="who">{f.directors[0]}</span></span></span>
                </button>
              ))}
            </div>
          )}
          {anchorFilm && (
            <div>
              <div className="section-label">Best partners on your shelf</div>
              {partners.length === 0 && <div className="empty">Nothing on the shelf shares enough with this one. Try another film.</div>}
              {partners.map((p) => {
                const other = p.a.key === anchorFilm.key ? p.b : p.a;
                return (
                  <button key={p.key} className="film-row partner" style={{ padding: "6px 0" }} onClick={() => onNight(p)}>
                    <Poster path={other.posterPath} title={other.name} size="w92" className="thumb" />
                    <span className="body">
                      <span className="title">{other.name} <span className="muted tnum" style={{ fontSize: 14 }}>{other.year}</span></span>
                      <span className="meta"><span className="who">{reasonLine(p, 2)}</span></span>
                    </span>
                    <span className="match tnum" aria-label={"Match strength " + Math.round(p.score)}>{Math.round(p.score)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "saved" && (
        <div>
          {saved.length === 0 && (
            <div className="empty">
              No saved double features yet. Open any pair and tap Save, or build your own around a film.
              <div style={{ marginTop: 12 }}><button className="link" onClick={() => setView("build")}>Build one</button></div>
            </div>
          )}
          {saved.map(({ pr, a, b }) => (
            <button key={pr.id} className="saved-row" onClick={() => onNight({ ...(scorePair(ix, a, b) || { a, b, reasons: [], key: a.key + "+" + b.key }), a, b, program: pr })}>
              <span className="saved-posters">
                <Poster path={a.posterPath} title={a.name} size="w92" />
                <Poster path={b.posterPath} title={b.name} size="w92" />
              </span>
              <span className="body">
                <span className="title">{pr.title || a.name + " + " + b.name}</span>
                <span className="meta">{a.name} then {b.name}</span>
                {pr.note && <span className="meta note">{pr.note}</span>}
                {pr.watched && <span className="meta accent">Watched {fmtDate(pr.watched)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One night: the pair, why it works, the math, and saving it as your own program.
function NightSheet({ pair, programs, finish, setFinish, onSave, onDelete, onLog, onOpenFilm, onClose }) {
  const existing = pair.program || programs.find((p) => (p.a === pair.a.key && p.b === pair.b.key) || (p.a === pair.b.key && p.b === pair.a.key));
  const [order, setOrder] = useState(() => (existing && existing.a === pair.b.key ? [pair.b, pair.a] : [pair.a, pair.b]));
  const [title, setTitle] = useState(existing?.title || "");
  const [note, setNote] = useState(existing?.note || "");
  const [logged, setLogged] = useState(false);
  const [first, second] = order;
  const [brk] = usePref("shelf-break-min", 15);
  const plan = nightPlan(first, second, finish, brk);
  const save = () => onSave({ id: existing?.id || newId(), a: first.key, b: second.key, title: title.trim(), note: note.trim() });
  return (
    <Sheet title="Double feature" onClose={onClose} tall
      foot={(
        <div className="btn-row">
          <button className="btn btn-outline" onClick={() => { onLog(first, second, existing && { ...existing, a: first.key, b: second.key, title: title.trim(), note: note.trim() }); setLogged(true); }} disabled={logged}>
            {logged ? "Logged both" : "Watched both"}
          </button>
          <button className="btn btn-primary" onClick={() => { save(); onClose(); }}>{existing ? "Save changes" : "Save"}</button>
        </div>
      )}>
      <div className="night-posters">
        {order.map((f, i) => (
          <button key={f.key} className="night-film" onClick={() => onOpenFilm(f)}>
            <span className="night-n">{i + 1}</span>
            <Poster path={f.posterPath} title={f.name} size="w342" />
            <span className="title">{f.name}</span>
            <span className="muted tnum">{[f.year, runtimeLabel(f.runtime)].filter(Boolean).join(" · ")}</span>
          </button>
        ))}
        <button className="night-swap" onClick={() => setOrder([second, first])} aria-label="Swap the running order"><Icon d={I.swap} size={18} sw={2.2} /></button>
      </div>

      {pair.reasons?.length > 0 && (
        <section className="stat-section" style={{ gap: 0 }}>
          <div className="section-label">Why they pair</div>
          {pair.reasons.map((r) => (
            <div key={r.text} className="list-row"><span className={"why-dot why-" + r.kind} aria-hidden="true" /><span className="grow">{r.text.replace(/^\w/, (c) => c.toUpperCase())}</span></div>
          ))}
        </section>
      )}

      {plan && (
        <section className="stat-section" style={{ gap: 0 }}>
          <div className="section-label">The night</div>
          <div className="list-row"><span className="grow muted">{brk ? `Running time, with a ${brk}-minute break` : "Running time, back to back"}</span><span className="tnum">{runtimeShort(plan.total)}</span></div>
          <div className="list-row">
            <span className="grow muted">Finish by</span>
            <label className="sort">
              {FINISH.find((x) => x[0] === finish)?.[1]}<Icon d={I.down} size={12} sw={2.6} />
              <select value={finish} onChange={(e) => setFinish(+e.target.value)} aria-label="Finish by">
                {FINISH.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="list-row"><span className="grow">Start by</span><span className="tnum accent" style={{ fontWeight: 600 }}>{plan.start}</span></div>
        </section>
      )}

      <section className="stat-section">
        <div className="section-label" style={{ marginBottom: 0 }}>Make it yours</div>
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name the night, e.g. Paranoia night" aria-label="Program name" maxLength={48} />
        <textarea className="notes" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why these two, snacks, who's coming" aria-label="Program note" />
        {existing && <button className="danger" style={{ alignSelf: "flex-start", fontSize: 15 }} onClick={() => { onDelete(existing.id); onClose(); }}>Delete this double feature</button>}
      </section>
    </Sheet>
  );
}

// ─── BACKUP ─────────────────────────────────────────────────────────────
// Relative "synced" time for the status line.
const ago = (t) => {
  if (!t) return "";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 45 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " hr ago" : new Date(t).toLocaleDateString();
};
function SyncPanel({ sync }) {
  const [pass, setPass] = useState("");
  const st = sync.status;
  // Keep "x min ago" honest while the sheet stays open.
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(id); }, []);
  if (st.state === "choose") {
    return (
      <section className="stat-section sync">
        <h2>Sync</h2>
        <p className="muted sync-note">This phone and your cloud copy both have data. Which should win?</p>
        <div className="btn-row" style={{ flexDirection: "column" }}>
          <button className="btn btn-primary" onClick={() => sync.choose("merge")}>Combine both (recommended)</button>
          <button className="btn btn-outline" onClick={() => sync.choose("cloud")}>Use the cloud copy</button>
          <button className="btn btn-outline" onClick={() => sync.choose("phone")}>Replace the cloud copy with this phone</button>
        </div>
      </section>
    );
  }
  if (!sync.on) {
    return (
      <section className="stat-section sync">
        <h2>Sync</h2>
        <p className="muted sync-note">Keeps a copy of your tags, copies, watches, posters and double features in the cloud, so deleting the app or switching phones doesn't lose them. Pick a passphrase and use the same one on any device.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (pass.trim().length >= 8) sync.connect(pass.trim()); }} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input id="sync-pass" className="field" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase (8+ characters)" aria-label="Sync passphrase" />
          <button className="btn btn-primary" type="submit" disabled={pass.trim().length < 8 || st.state === "syncing"}>{st.state === "syncing" ? "Connecting…" : "Turn on sync"}</button>
        </form>
        {st.error && <p className="sync-error">{st.error}</p>}
        <p className="muted sync-note">Keep it somewhere safe, like your password manager. Without it the cloud copy can't be opened.</p>
      </section>
    );
  }
  // "Synced" is when this phone last confirmed it matches the cloud (a Sync now, opening the app, a save).
  // When the cloud copy itself last changed is a separate, smaller line.
  const label = st.state === "syncing" ? "Syncing…" : st.state === "error" ? "Not synced" : st.restored ? "Restored from the cloud " + ago(st.checked || st.at) : st.checked || st.at ? "Synced " + ago(st.checked || st.at) : "On";
  return (
    <section className="stat-section sync">
      <div className="stat-head">
        <h2>Sync</h2>
        <span className={"sync-dot " + (st.state === "error" ? "bad" : st.state === "syncing" ? "busy" : "ok")}>{label}</span>
      </div>
      {st.state === "error" && <p className="sync-error">{st.error}</p>}
      <p className="muted sync-note">Changes save to the cloud a moment after you make them, and the app checks for newer copies whenever you open it.{st.at && st.checked && st.state === "ok" ? ` Last change saved ${ago(st.at)}.` : ""}</p>
      <div style={{ display: "flex", gap: 22 }}>
        <button className="link" onClick={sync.syncNow}>Sync now</button>
        <button className="link" style={{ color: "var(--label-2)" }} onClick={sync.disconnect}>Turn off on this device</button>
      </div>
    </section>
  );
}

function Backup({ D, sync, films, bare }) {
  const fileRef = useRef(null);
  const lbRef = useRef(null);
  const [msg, setMsg] = useState("");
  const [lbMsg, setLbMsg] = useState("");
  const doDiary = (e) => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = "";
    const r = new FileReader();
    r.onload = () => {
      const rows = parseCSV(String(r.result || ""));
      const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
      const col = (n) => head.indexOf(n);
      const iName = col("name"), iYear = col("year"), iRating = col("rating"), iWatched = col("watched date"), iDate = col("date");
      if (iName < 0 || iWatched < 0) { setLbMsg("That isn't diary.csv. It's the file with a Watched Date column, inside the Letterboxd export."); return; }
      const owned = new Map(films.map((f) => [(f.name + "|" + f.year).toLowerCase(), f.key]));
      const byKey = {};
      let n = 0, mine = 0;
      rows.forEach((row) => {
        const name = (row[iName] || "").trim(), year = (row[iYear] || "").trim(), date = (row[iWatched] || row[iDate] || "").trim();
        if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const key = owned.get((name + "|" + year).toLowerCase()) || name + "|" + year;
        const rating = parseFloat(row[iRating]);
        (byKey[key] ||= []).push(Number.isFinite(rating) ? { date, rating } : { date });
        n++; if (owned.has((name + "|" + year).toLowerCase())) mine++;
      });
      if (!n) { setLbMsg("No diary entries found in that file."); return; }
      D.importDiary(byKey);
      setLbMsg(`Imported ${n.toLocaleString()} diary entries: ${mine.toLocaleString()} for films on your shelf, ${(n - mine).toLocaleString()} for films you don't own. They're in your Diary now.`);
    };
    r.readAsText(file);
  };

  const doExport = () => {
    const blob = new Blob([JSON.stringify(D.exportPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "the-shelf-backup-" + todayISO() + ".json"; a.click();
    URL.revokeObjectURL(url);
    setMsg("Backup exported. Keep the file somewhere outside Safari, like Files or iCloud Drive.");
  };
  const doImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { D.importAll(JSON.parse(r.result)); setMsg("Backup restored."); } catch { setMsg("That file isn't a Shelf backup. Choose the .json file you exported."); } };
    r.readAsText(file);
    e.target.value = "";
  };
  const row = (label, n) => <div className="list-row"><span className="grow muted">{label}</span><span className="tnum">{n}</span></div>;

  return (
    <div className={bare ? "" : "page"} style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {!bare && <div className="page-head"><h1>Backup</h1></div>}
      {sync && <SyncPanel sync={sync} />}
      <section className="stat-section" style={{ gap: 0, marginTop: bare ? 0 : -14 }}>
        {row("Films", films.length)}
        {row("Added here", films.filter((f) => f.userAdded).length)}
        {row("Tagged", Object.values(D.userData).filter((u) => u.tags && u.tags.length).length)}
        {row("Custom posters", Object.values(D.userData).filter((u) => u.poster).length)}
        {row("Films with copy details", Object.values(D.userData).filter((u) => u.copies && u.copies.length).length)}
        {row("Watches logged here or imported", Object.values(D.watchLog).reduce((n, v) => n + entriesOf(v).length, 0))}
        {row("Wishlist", D.want.filter((w) => !w.bought).length)}
        {row("Double features saved", D.programs.length)}
      </section>

      <section className="stat-section">
        <div className="btn-row" style={{ flexDirection: "column" }}>
          <button className="btn btn-primary" style={{ height: 46 }} onClick={doExport}>Export backup</button>
          <button className="btn btn-outline" style={{ height: 46 }} onClick={() => fileRef.current.click()}>Restore from backup</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={doImport} style={{ display: "none" }} />
        <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{msg || (sync?.on
          ? "Sync keeps all of this in the cloud. An exported file is an extra copy you hold yourself."
          : "Tags, notes, poster choices, double features, films added here, the wishlist and watch log live only on this device. Export now and then, and always before clearing Safari.")}</span>
      </section>

      <section className="stat-section">
        <h2>Letterboxd diary</h2>
        <p className="muted sync-note">Bring in your whole diary, including films you don't own. On Letterboxd: Settings, Data, Export your data. Unzip it in Files, then choose <b>diary.csv</b> here.</p>
        <button className="btn btn-outline" style={{ height: 46 }} onClick={() => lbRef.current.click()}>Import diary.csv</button>
        <input ref={lbRef} type="file" accept=".csv,text/csv" onChange={doDiary} style={{ display: "none" }} />
        {lbMsg && <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{lbMsg}</span>}
      </section>

      <p className="foot">Film data and images from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
  );
}

// Hidden tabs stay built but skip re-rendering unless their own inputs change.
// ─── CRITIC SCORES ──────────────────────────────────────────────────────
// IMDb, Rotten Tomatoes and Metascore from OMDb, through api/omdb.js. Until OMDB_API_KEY is set in
// Vercel the function answers 503 and every score in the app stays hidden. Cached here for a month.
const scoreCache = readJSON("shelf-scores", {});
const SCORE_TTL = 30 * 864e5;
const scoreState = { off: false, subs: new Set(), inflight: new Map(), saveT: null };
const scoreNotify = () => scoreState.subs.forEach((f) => f());
const scoreSave = () => {
  clearTimeout(scoreState.saveT);
  scoreState.saveT = setTimeout(() => store.set("shelf-scores", JSON.stringify(scoreCache)), 400);
};
const scoreFresh = (id) => { const c = scoreCache[id]; return c && Date.now() - c.at < SCORE_TTL ? c : null; };
function fetchScore(tmdbId) {
  const id = String(tmdbId || "");
  if (!/^\d+$/.test(id) || scoreState.off) return Promise.resolve(null);
  const hit = scoreFresh(id);
  if (hit) return Promise.resolve(hit);
  if (scoreState.inflight.has(id)) return scoreState.inflight.get(id);
  const p = fetch("/api/omdb?tmdb=" + id).then(async (r) => {
    // No key yet (503), or no such function (a local build serving the app shell instead): hide scores.
    if (r.status === 503 || r.status === 404 || !(r.headers.get("content-type") || "").includes("json")) {
      if (!scoreState.off) { scoreState.off = true; scoreNotify(); }
      return null;
    }
    if (!r.ok) return null; // daily limit or a hiccup: try again another time
    const j = await r.json();
    scoreCache[id] = { ...j, at: Date.now() };
    scoreSave(); scoreNotify();
    return scoreCache[id];
  }).catch(() => null).finally(() => scoreState.inflight.delete(id));
  scoreState.inflight.set(id, p);
  return p;
}
// Many at once, a few at a time. Stops early if scores turn out to be off.
async function fetchScores(ids, onProgress) {
  const todo = [...new Set(ids.map(String))].filter((id) => /^\d+$/.test(id) && !scoreFresh(id));
  let done = 0;
  const worker = async () => {
    while (todo.length && !scoreState.off) { await fetchScore(todo.shift()); done++; onProgress?.(done); }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return done;
}
function useScores() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    scoreState.subs.add(f);
    return () => scoreState.subs.delete(f);
  }, []);
  return scoreState.off ? null : scoreCache;
}
function useScore(tmdbId) {
  const all = useScores();
  useEffect(() => { if (tmdbId) fetchScore(tmdbId); }, [tmdbId]);
  const s = all && all[String(tmdbId)];
  return s && s.found ? s : null;
}
const scoreBits = (s) => [
  s.imdb != null && ["IMDb", s.imdb.toFixed(1)],
  s.rt != null && ["RT", s.rt + "%"],
  s.meta != null && ["Metascore", String(s.meta)],
].filter(Boolean);
function ScoreLine({ tmdbId, className = "critics" }) {
  const s = useScore(tmdbId);
  if (!s) return null;
  const bits = scoreBits(s);
  if (!bits.length) return null;
  return (
    <div className={className + " tnum"} aria-label="Critic scores">
      {bits.map(([k, v]) => <span key={k}><i>{k}</i> {v}</span>)}
    </div>
  );
}
// One critics number for comparisons: Metascore when there is one, else RT, else IMDb ×10.
const criticOf = (s) => (!s || !s.found ? null : s.meta != null ? { v: s.meta, src: "Metascore" } : s.rt != null ? { v: s.rt, src: "RT" } : s.imdb != null ? { v: Math.round(s.imdb * 10), src: "IMDb" } : null);

function CriticsSection({ films }) {
  const all = useScores();
  const [busy, setBusy] = useState(null);
  const rated = useMemo(() => films.filter((f) => f.rating != null && f.tmdb), [films]);
  if (!all) return null;
  const pairs = rated.map((f) => ({ f, c: criticOf(all[String(f.tmdb)]) })).filter((x) => x.c)
    .map((x) => ({ ...x, you: Math.round(x.f.rating * 20), gap: Math.round(x.f.rating * 20) - x.c.v }));
  const missing = rated.filter((f) => !scoreFresh(String(f.tmdb))).length;
  const fetchMore = async () => {
    // The free OMDb key allows about 1,000 lookups a day; take a bite and let the rest wait.
    const batch = rated.filter((f) => !scoreFresh(String(f.tmdb))).slice(0, 300).map((f) => f.tmdb);
    setBusy({ done: 0, of: batch.length });
    await fetchScores(batch, (done) => setBusy({ done, of: batch.length }));
    setBusy(null);
  };
  const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1));
  const kinder = pairs.filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 5);
  const harsher = pairs.filter((x) => x.gap < 0).sort((a, b) => a.gap - b.gap).slice(0, 5);
  const close = pairs.filter((x) => Math.abs(x.gap) <= 10).length;
  const row = (x) => (
    <div className="list-row" key={x.f.key}>
      <span className="grow">{x.f.name} <span className="muted tnum">{x.f.year}</span></span>
      <span className="tnum critic-vs"><span className="accent">{stars(x.f.rating)}</span><span className="muted"> vs </span>{x.c.v}</span>
    </div>
  );
  return (
    <section className="stat-section" style={{ gap: 0 }}>
      <h2 style={{ marginBottom: 6 }}>You vs the critics</h2>
      {pairs.length >= 5 ? (
        <>
          <div className="list-row"><span className="grow muted">Your average, out of 100</span><span className="tnum accent">{avg(pairs.map((x) => x.you))}</span></div>
          <div className="list-row"><span className="grow muted">Critics' average, same films</span><span className="tnum">{avg(pairs.map((x) => x.c.v))}</span></div>
          <div className="list-row"><span className="grow muted">Within 10 points of them</span><span className="tnum">{Math.round((close / pairs.length) * 100)}%</span></div>
          {kinder.length > 0 && <><div className="section-label caps critic-sub">You like more</div>{kinder.map(row)}</>}
          {harsher.length > 0 && <><div className="section-label caps critic-sub">They like more</div>{harsher.map(row)}</>}
        </>
      ) : (
        <span className="muted" style={{ fontSize: 14, padding: "4px 0 8px" }}>Fetch scores for your rated films to see where you and the critics part ways.</span>
      )}
      {missing > 0 && (
        <div className="list-row">
          <span className="grow muted tnum">{busy ? `Fetching ${busy.done} of ${busy.of}` : `${pairs.length} of ${rated.length} rated films compared`}</span>
          <button className="link" onClick={fetchMore} disabled={!!busy}>{busy ? "Working" : "Fetch scores"}</button>
        </div>
      )}
      <span className="muted" style={{ fontSize: 12, marginTop: 8 }}>Your stars ×20 against Metascore, or Rotten Tomatoes when there's no Metascore.</span>
    </section>
  );
}

// ─── ON DECK ────────────────────────────────────────────────────────────
const dayDiff = (iso) => Math.round((Date.parse(todayISO() + "T12:00:00") - Date.parse(iso + "T12:00:00")) / 864e5);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const deckAge = (it, days, long) => {
  const d = dayDiff(it.added);
  if (d >= days - 1 && days > 2) return "Leaves tomorrow";
  if (d <= 0) return long ? "Added today" : "Today";
  if (d === 1) return long ? "Added yesterday" : "Yesterday";
  if (d < 7) { const w = WEEKDAYS[new Date(it.added + "T12:00:00").getDay()]; return long ? "Added " + w : w; }
  return long ? `Added ${d} days ago` : d + " days";
};
const deckUntil = (it, days) => {
  const d = new Date(it.added + "T12:00:00"); d.setDate(d.getDate() + days - 1);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
};
const totalRuntime = (list) => { const m = list.reduce((n, x) => n + (x.f.runtime || 0), 0); return m ? runtimeLabel(m) : null; };
const filmsWord = (n) => n + (n === 1 ? " film" : " films");

// The strongest double feature hiding in the deck, if there is one worth suggesting.
function deckPairOf(ix, list) {
  let best = null;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = scorePair(ix, list[i].f, list[j].f, "build");
    if (p && p.score >= 3 && (!best || p.score > best.score)) best = p;
  }
  return best;
}
function DeckPairCard({ pair, finish, onPair }) {
  if (!pair) return null;
  const plan = nightPlan(pair.a, pair.b, finish, getPref("shelf-break-min", 15));
  const fin = (FINISH.find((x) => x[0] === finish) || [0, "11 PM"])[1];
  return (
    <button className="deck-pair" onClick={() => onPair(pair)}>
      <span className="deck-pair-ic"><Icon d={I.doubles} size={17} sw={2} /></span>
      <span className="grow">
        <b>{pair.a.name}, then {pair.b.name}</b>
        <span className="muted">{reasonLine(pair, 1)}{plan ? ` · start by ${plan.start} to finish by ${fin}` : ""}</span>
      </span>
      <Icon d={I.chev} size={14} sw={2.6} />
    </button>
  );
}

// On Home the deck's own pair suggestion stays on the On deck page; Double features is right below.
function DeckShelf({ deck, days, onPin, onRemove, onPick, onSeeAll }) {
  return (
    <section className="shelf deck-shelf" aria-label="On deck">
      <div className="shelf-head">
        <div>
          <h2>On deck</h2>
          <p className="tnum">{deck.length ? `${filmsWord(deck.length)} · this week` : "Nothing yet"}</p>
        </div>
        <span className="shelf-links">
          {deck.length > 1 && <button className="link deck-pick" onClick={onPick}><Icon d={I.shuffle} size={15} sw={2.2} />Pick for me</button>}
          <button className="link" onClick={onSeeAll}>See all</button>
        </span>
      </div>
      {deck.length ? (
        <div className="shelf-row">
          {deck.map((x) => {
            const fading = dayDiff(x.added) >= days - 1 && days > 2;
            return (
              <div key={x.key} className={"deck-tile" + (fading ? " fading" : "") + (x.tonight ? " tonight" : "")}>
                <button className="shelf-item" data-key={x.key} onClick={() => onPin(x)} aria-pressed={!!x.tonight}
                  aria-label={(x.tonight ? "Unpin " : "Watch tonight: ") + x.f.name}>
                  <Poster path={x.f.posterPath} title={x.f.name} size="w185" />
                  <span className={fading ? "accent" : ""}>{x.tonight ? "Tonight" : deckAge(x, days)}</span>
                </button>
                <button className="deck-x" onClick={() => onRemove(x)} aria-label={"Remove " + x.f.name + " from On deck"}><Icon d={I.close} size={12} sw={3} /></button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="deck-empty">Empty. Toss films in from any film page, or long-press a poster.</p>
      )}
    </section>
  );
}

function DeckPage({ deck, days, pair, finish, onOpen, onPin, onRemove, onKeep, onPick, onAdd, onPair }) {
  const tonight = deck.find((x) => x.tonight);
  const fresh = deck.filter((x) => !(dayDiff(x.added) >= days - 1 && days > 2));
  const fading = deck.filter((x) => !fresh.includes(x));
  const total = totalRuntime(deck);
  const row = (x, leaving) => (
    <div key={x.key} className={"deck-row" + (leaving ? " fading" : "")}>
      <button className="deck-row-main" data-key={x.key} onClick={() => onOpen(x.f)} onPointerDown={() => preloadFilm(x.f)}>
        <span className={"deck-thumb" + (x.tonight ? " on" : "")}><Poster path={x.f.posterPath} title={x.f.name} size="w92" className="thumb" /></span>
        <span className="body">
          <span className="title">{x.f.name} <span className="muted tnum">{x.f.year}</span></span>
          <span className="meta">{[peopleLabel(x.f.directors), runtimeLabel(x.f.runtime)].filter(Boolean).join(" · ")}</span>
          <span className={"meta small" + (leaving ? " accent" : "")}>{deckAge(x, days, true)}</span>
        </span>
      </button>
      {leaving
        ? <button className="deck-keep" onClick={() => onKeep(x)}>Keep</button>
        : <button className={"deck-ib" + (x.tonight ? " on" : "")} onClick={() => onPin(x)} aria-pressed={!!x.tonight} aria-label={(x.tonight ? "Unpin " : "Watch tonight: ") + x.f.name}>
            <Icon d={I.moon} size={20} sw={2} fill={x.tonight ? "currentColor" : "none"} />
          </button>}
      <button className="deck-ib" onClick={() => onRemove(x)} aria-label={"Remove " + x.f.name}><Icon d={I.close} size={16} sw={2.6} /></button>
    </div>
  );
  return (
    <div className="page deck-page">
      <div className="page-head" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <h1>On deck</h1>
        <span className="muted tnum" style={{ fontSize: 15 }}>{deck.length ? filmsWord(deck.length) + (total ? ` · ${total} of film` : "") : "Nothing on deck"}</span>
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={onPick} disabled={deck.length < 1}>Pick for me</button>
        <button className="btn btn-outline" onClick={onAdd}><Icon d={I.plus} size={16} sw={2.4} />Add a film</button>
      </div>
      {tonight && (
        <div className="deck-tonight">
          <span className="caps-badge">Tonight</span>
          <span className="grow">{tonight.f.name}</span>
          <button className="link" onClick={() => onPin(tonight)}>Change</button>
        </div>
      )}
      {deck.length === 0 && <div className="empty">Toss films in from any film page, or long-press a poster anywhere. They leave on their own after {days} days, or the moment you log a watch.</div>}
      {fresh.length > 0 && <div><div className="section-label caps deck-sec">This week</div>{fresh.map((x) => row(x, false))}</div>}
      {fading.length > 0 && <div><div className="section-label caps deck-sec">Leaving soon</div>{fading.map((x) => row(x, true))}</div>}
      {pair && <div><div className="section-label caps deck-sec">Makes a night</div><DeckPairCard pair={pair} finish={finish} onPair={onPair} /></div>}
      {deck.length > 0 && <p className="foot">Films leave on their own after {days} days, or the moment you log a watch. Change that in Preferences.</p>}
    </div>
  );
}

// Add to the deck from inside the deck: search the shelf, or take one you haven't watched in ages.
function DeckAddSheet({ films, onDeck, onToggle, onClose }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    if (query) return films.filter((f) => f.name.toLowerCase().includes(query) || f.directors.some((d) => d.toLowerCase().includes(query))).slice(0, 40);
    return films.filter((f) => !f.tags.includes("sell")).slice().sort((a, b) => (a.lastWatched || "").localeCompare(b.lastWatched || "")).slice(0, 30);
  }, [films, query]);
  return (
    <Sheet title="Add to On deck" tall onClose={onClose} left={<span />} right={<button className="right" onClick={onClose}>Done</button>}>
      <label className="search" style={{ margin: 0 }}>
        <Icon d={I.search} size={16} sw={2.2} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or director" aria-label="Search your shelf" />
      </label>
      {!query && <div className="section-label caps" style={{ marginTop: 4 }}>Longest since a watch</div>}
      <div className="deck-add-list">
        {list.map((f) => {
          const on = onDeck.has(f.key);
          return (
            <button key={f.key} className="film-row" onClick={() => onToggle(f)} aria-pressed={on}>
              <Poster path={f.posterPath} title={f.name} size="w92" className="thumb" />
              <span className="body">
                <span className="title">{f.name} <span className="muted tnum">{f.year}</span></span>
                <span className="meta">{f.lastWatched ? "Last watched " + fmtDate(f.lastWatched) : "Never logged"}</span>
              </span>
              <span className={"deck-check" + (on ? " on" : "")}><Icon d={on ? I.check : I.plus} size={16} sw={2.6} /></span>
            </button>
          );
        })}
        {list.length === 0 && <div className="empty">Nothing on your shelf matches "{q.trim()}".</div>}
      </div>
    </Sheet>
  );
}

// Long-press any poster: the film lifts out with a short menu, like iOS.
function PressMenu({ f, inDeck, onDeck, onLog, onDouble, onOpen, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const item = (label, icon, fn, cls = "") => (
    <button role="menuitem" className={"press-item " + cls} onClick={() => { onClose(); fn(); }}>{label}<Icon d={icon} size={18} sw={2.2} /></button>
  );
  return createPortal(
    <div className="press-scrim" onClick={onClose}>
      <div className="press-box" onClick={(e) => e.stopPropagation()}>
        <div className="press-poster"><Poster path={f.posterPath} title={f.name} size="w342" /></div>
        <div className="press-menu" role="menu" aria-label={f.name}>
          {item(inDeck ? "Remove from On deck" : "Add to On deck", inDeck ? I.close : I.plus, onDeck, "lead")}
          {item("Log a watch", I.calendar, onLog)}
          {item("Double it up", I.doubles, onDouble)}
          {item("Open", I.chev, onOpen)}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Toast({ toast, onAction }) {
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span className="grow">{toast.text}</span>
      {toast.action && <button className="link" onClick={onAction}>{toast.action}</button>}
    </div>
  );
}

// Hold a finger on anything with a data-key (a film's poster) to open its menu. Cancels if you move,
// and swallows the tap that would otherwise follow. Right-click does the same on a computer.
function useLongPress(onPress) {
  const cb = useEvent(onPress);
  useEffect(() => {
    let timer = null, start = null, fired = false;
    const cancel = () => { clearTimeout(timer); timer = null; };
    const target = (e) => { const t = e.target.closest?.("[data-key]"); return t && !t.closest(".press-scrim") ? t : null; };
    const onStart = (e) => {
      fired = false;
      const t = target(e);
      if (!t || e.touches.length > 1) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      cancel();
      timer = setTimeout(() => { timer = null; fired = true; cb(t.dataset.key); }, 460);
    };
    const onMove = (e) => {
      if (!timer) return;
      const p = e.touches[0];
      if (Math.hypot(p.clientX - start.x, p.clientY - start.y) > 9) cancel();
    };
    const onEnd = (e) => { cancel(); if (fired && e.cancelable) e.preventDefault(); };
    const onClick = (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } };
    const onCtx = (e) => { const t = target(e); if (!t) return; e.preventDefault(); cancel(); if (!fired) cb(t.dataset.key); };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: false });
    document.addEventListener("touchcancel", cancel);
    document.addEventListener("scroll", cancel, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onCtx);
    return () => {
      cancel();
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", cancel);
      document.removeEventListener("scroll", cancel, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, []);
}

const HomeTab = memo(Home), LibraryTab = memo(Library), YouTab = memo(You);

// ─── ROOT ───────────────────────────────────────────────────────────────
const TABS = [["home", "Home", I.home], ["library", "Library", I.library], ["you", "You", I.you]];
const TAB_NAMES = Object.fromEntries(TABS.map(([k, l]) => [k, l]));

export default function App() {
  const D = useData();
  const sync = useSync(D);
  const [tab, setTab] = useState("home");
  const [stack, setStack] = useState([]);
  const [extra, setExtra] = useState(null);
  const [adding, setAdding] = useState(null);
  const [picking, setPicking] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const [libReset, setLibReset] = useState(0);
  const [filters, setFilters] = useStored("shelf-filters", {});
  const [home, setHome] = useHomeState();
  // Preference: a fresh Home pick every time the app opens, instead of one pick per day.
  useEffect(() => { if (getPref("shelf-random-pick", false)) setHome((h) => ({ ...h, pick: h.pick + 1 + Math.floor(Math.random() * 7) })); }, []);

  const [hiddenTagsPref] = usePref("shelf-hidden-tags", "");
  const hiddenTags = useMemo(() => hiddenTagsPref.split(",").filter(Boolean), [hiddenTagsPref]);
  const films = useMemo(() => {
    const seedKeys = new Set(SEED_COLLECTION.map(fkey));
    // A removed film (any film: imported or added here) is flagged in its own data, which syncs and can be undone;
    // its watch history stays in the diary.
    return [...SEED_COLLECTION, ...D.added.filter((f) => !seedKeys.has(fkey(f)))]
      .filter((f) => !D.userData[fkey(f)]?.removed)
      .map((f) => deriveFilm(f, D.userData, D.watchLog, hiddenTags));
  }, [D.added, D.userData, D.watchLog, hiddenTags]);
  const removedFilms = useMemo(() => {
    const seedKeys = new Set(SEED_COLLECTION.map(fkey));
    return [...SEED_COLLECTION, ...D.added.filter((f) => !seedKeys.has(fkey(f)))]
      .filter((f) => D.userData[fkey(f)]?.removed)
      .map((f) => ({ key: fkey(f), name: f.name, year: f.year, on: D.userData[fkey(f)].removed }))
      .sort((a, b) => b.on.localeCompare(a.on) || a.name.localeCompare(b.name));
  }, [D.added, D.userData]);
  useMemo(() => { [...films].sort((a, b) => b.recency - a.recency).forEach((f, i) => { f.recentRank = i + 1; }); }, [films]);
  const byKey = useMemo(() => new Map(films.map((f) => [f.key, f])), [films]);
  // "The shelf" for counts, Home and Stats: digital-only films join only if you say so in Preferences.
  const [countDigital] = usePref("shelf-count-digital", false);
  const [hideSell] = usePref("shelf-hide-sell", false);
  const shelfFilms = useMemo(() => films.filter((f) => (countDigital || !f.digitalOnly) && (!hideSell || !f.tags.includes("sell"))), [films, countDigital, hideSell]);
  const ix = useMemo(() => pairIndex(films), [films]);
  const homePairs = useMemo(() => bestPairs(ix, 60), [ix]);
  // Color shelves join Home once every poster's color is known (read in the background, once per poster).
  const colorProgress = usePosterColors(shelfFilms, true);
  const colorShelves = useMemo(() => (colorProgress ? [] : buildColorShelves(shelfFilms)), [shelfFilms, colorProgress]);
  const recipes = useMemo(() => [...buildRecipes(shelfFilms, D.customTags, homePairs), ...colorShelves], [shelfFilms, D.customTags, homePairs, colorShelves]);
  const [wantOpen, setWantOpen] = useState(null); // a want's id, for its sheet
  const [peek, setPeek] = useState(null); // a greyed-out filmography film
  const wanted = useMemo(() => new Set(D.want.filter((w) => !w.bought).map((w) => wantId(w).toLowerCase())), [D.want]);
  // Pull in the Orbit + Amazon wishlists once per device.
  useEffect(() => {
    if (store.get("shelf-import-" + IMPORT_ID)) return;
    D.importWants(IMPORTED_WANTS);
    store.set("shelf-import-" + IMPORT_ID, "1");
  }, []);
  useEffect(() => {
    if (store.get("shelf-import-" + IMPORT2_ID)) return;
    D.importWants(IMPORT2_PATCH, { addNew: false }); // fill blanks on wants you already have; never re-add removed ones
    D.importWants(IMPORT2_ADD);
    store.set("shelf-import-" + IMPORT2_ID, "1");
  }, []);
  const [night, setNight] = useState(null);
  const [finish, setFinish] = useStored("shelf-finishby", 23);
  const defs = useMemo(() => makeFilters(D.customTags, hiddenTags, recipes), [D.customTags, hiddenTags, recipes]);
  const allTags = useMemo(() => [...Object.entries(TAGS).filter(([k]) => !hiddenTags.includes(k)), ...D.customTags.map((t) => [t, t])], [D.customTags, hiddenTags]);
  // Label chips for copies: the ones you use most, then ones you've typed, then the usual boutique and studio labels.
  const labels = useMemo(() => {
    const used = new Map();
    films.forEach((f) => f.copies.forEach((c) => c.label && used.set(c.label, (used.get(c.label) || 0) + 1)));
    const byUse = [...used].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((x) => x[0]);
    return [...new Set([...byUse, ...D.labels.map(canonicalLabel), ...KNOWN_LABELS])];
  }, [films, D.labels]);
  const [copyEdit, setCopyEdit] = useState(null);
  const [detailsFor, setDetailsFor] = useState(null);

  // On deck: what's still in the running this week. Films drop off after the chosen number of days.
  const [deckDays] = usePref("shelf-deck-days", 7);
  const deck = useMemo(() => {
    const today = todayISO();
    return D.deck.filter((x) => byKey.has(x.key) && dayDiff(x.added) < deckDays)
      .map((x) => ({ ...x, tonight: x.tonight === today, f: byKey.get(x.key) }));
  }, [D.deck, byKey, deckDays, home.date]);
  useEffect(() => {
    const live = new Set(deck.map((x) => x.key));
    if (D.deck.some((x) => !live.has(x.key))) D.setDeck((d) => d.filter((x) => live.has(x.key)));
  }, [deck]);
  const deckKeys = useMemo(() => new Set(deck.map((x) => x.key)), [deck]);
  const deckPair = useMemo(() => (deck.length > 1 && deck.length <= 30 ? deckPairOf(ix, deck) : null), [deck, ix]);
  const [toast, setToast] = useState(null);
  const toastT = useRef(null);
  const showToast = (t) => {
    clearTimeout(toastT.current);
    setToast({ ...t, id: Date.now() });
    toastT.current = setTimeout(() => setToast(null), 2800);
  };
  const [press, setPress] = useState(null);   // long-pressed film key
  const [logFor, setLogFor] = useState(null); // Log a watch from outside a film page
  const [deckAdd, setDeckAdd] = useState(false);
  const toggleDeck = (f, quiet) => {
    const on = deckKeys.has(f.key);
    D.toggleDeck(f.key);
    if (quiet) return;
    if (on) showToast({ text: f.name + " is off deck" });
    else showToast({ text: `${f.name} is on deck · ${filmsWord(deck.length + 1)} this week`, action: "View", go: "deck" });
  };
  const pinDeck = (x) => D.pinTonight(x.tonight ? null : x.key);
  const pickDeck = () => {
    const pool = deck.filter((x) => !x.tonight);
    if (!pool.length) return;
    D.pinTonight(pool[Math.floor(Math.random() * pool.length)].key);
  };
  const removeFilm = (f) => {
    D.updateFilm(f.key, { removed: todayISO() });
    showToast({ text: f.name + " removed from your collection", action: "Undo", run: () => D.updateFilm(f.key, { removed: undefined }) });
  };
  const restoreFilm = (key) => D.updateFilm(key, { removed: undefined });
  const logFilm = (key, date, rating) => { D.logWatch(key, date, rating); if (rating !== undefined) D.updateFilm(key, { rating }); };
  useLongPress((key) => { if (byKey.has(key)) setPress(key); });

  // Films added by hand in the old app have no TMDB data yet: look them up once.
  const tried = useRef(new Set());
  useEffect(() => {
    D.added.filter((f) => !f.tmdb && !tried.current.has(fkey(f))).forEach(async (f) => {
      tried.current.add(fkey(f));
      try {
        const res = await tmdb("/search/movie", { query: f.name, year: f.year });
        const hit = (res.results || []).find((r) => (r.release_date || "").startsWith(f.year)) || res.results?.[0];
        if (!hit) return;
        const d = await tmdb(`/movie/${hit.id}`, { append_to_response: "credits,images,keywords", include_image_language: "en,null" });
        D.patchAdded(fkey(f), shapeTmdbMovie(d));
      } catch {}
    });
  }, [D.added]);

  // The stack holds film keys (strings) and pushed lists ({ id, kind, label, test }).
  const top = stack.length ? stack[stack.length - 1] : null;
  const entryName = (e) => (typeof e === "string" ? byKey.get(e)?.name || "Back" : e.label);
  const listSeq = useRef(0);
  useBodyLock(!!top || !!wantOpen || !!peek || !!adding || !!picking || showFilters || !!copyEdit || !!detailsFor || !!night || !!press || !!logFor || deckAdd);

  // Film pages use a plain iOS-style push: the page slides in the instant you tap (no screen snapshot
  // to wait for, unlike a view transition) and slides back out to the right.
  const [leaving, setLeaving] = useState(false);
  // The tabs sit "under" the stack: pushed a third of the way left and dimmed while any film is open.
  const covered = stack.length > 1 || (stack.length === 1 && !leaving);
  const openFilm = (f) => {
    setLeaving(false);
    setStack((s) => (s[s.length - 1] === f.key ? s : [...s, f.key]));
  };
  const pushList = (entry) => {
    setLeaving(false);
    setStack((s) => [...s, { ...entry, id: "list:" + ++listSeq.current }]);
  };
  const back = (opts) => {
    if (!stack.length || leaving) return;
    const pop = () => { setStack((s) => s.slice(0, -1)); setLeaving(false); };
    if (opts?.swiped || reduceMotion()) return pop();
    setLeaving(true);
    setTimeout(pop, 330);
  };
  // Each tab remembers how far down you were, like iOS tab bars.
  const tabScroll = useRef({});
  const goTab = (t) => {
    if (t === tab) {
      // Tapping the Library tab while you're in it is a full reset, in one tap: every page closes and the
      // Library comes back exactly as it first opens (no search, no filters, at the top).
      if (t === "library") {
        forgetScroll();
        setExtra(null);
        setLibReset((n) => n + 1);
        if (stack.length && !leaving) {
          setStack((s) => s.slice(-1)); setLeaving(true);
          setTimeout(() => { setStack([]); setLeaving(false); window.scrollTo(0, 0); }, reduceMotion() ? 0 : 330);
        } else if (!stack.length) window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Other tabs: pop straight back to the root, animated like iOS; tap again to scroll up.
      if (stack.length) {
        if (leaving) return;
        setStack((s) => s.slice(-1)); setLeaving(true);
        setTimeout(() => { setStack([]); setLeaving(false); }, reduceMotion() ? 0 : 330);
      } else window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    tabScroll.current[tab] = stack.length ? lockedY : window.scrollY;
    forgetScroll();
    // Switching tabs is instant, even with a film open: no slide back underneath.
    document.querySelectorAll(".under, .nav-dim").forEach((e) => { e.style.transition = "none"; });
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll(".under, .nav-dim").forEach((e) => { e.style.transition = ""; })));
    transition("tab", () => { setStack([]); setTab(t); }, () => window.scrollTo(0, tabScroll.current[t] || 0));
  };
  // From a Home shelf's "See all": the shelf's visible posters fly to their spots in the Library
  // grid and the shelf title becomes the filter chip. Anything that can't be matched just fades.
  const toLibrary = (filter, from) => {
    forgetScroll();
    const update = () => { setExtra(filter); setStack([]); setTab("library"); window.scrollTo(0, 0); };
    const shelf = from?.closest?.("section.shelf");
    if (!shelf) return update();
    const named = [];
    const name = (el, n) => { el.style.viewTransitionName = n; named.push(el); };
    const clear = () => named.splice(0).forEach((el) => { el.style.viewTransitionName = ""; });
    const items = [...shelf.querySelectorAll("[data-key]")].filter(onScreen).slice(0, 8);
    items.forEach((b, i) => name(b.querySelector(".poster"), "see-" + i));
    const title = shelf.querySelector("h2");
    if (title) name(title, "see-title");
    const t = transition("seeall", () => { clear(); update(); }, () => {
      items.forEach((b, i) => { const el = posterFor(b.dataset.key); if (el) name(el, "see-" + i); });
      const chip = document.querySelector(".lib-filter .chip.on");
      if (chip) name(chip, "see-title");
    });
    if (t) t.finished.finally(clear); else clear();
  };
  const onPerson = (name) => pushList({ kind: "person", label: name, test: (f) => f.directors.includes(name) || f.dop.includes(name) || f.music.includes(name) || f.cast.includes(name) });
  const buildAround = (f) => { setNight(null); pushList({ kind: "doubles", label: "Double features", view: "build", anchor: f.key }); };
  const logBoth = (a, b, program) => {
    D.logWatch(a.key); D.logWatch(b.key);
    if (program) D.saveProgram({ ...program, watched: todayISO() });
  };
  const openFilmE = useEvent(openFilm);
  const onSeeAllE = useEvent((s) => pushList({ kind: "shelf", label: s.title, test: s.test, sort: s.listSort }));
  const onSearchE = useEvent(() => { toLibrary(null); setSearchFocus((n) => n + 1); });
  const onFiltersE = useEvent((x) => (x === "reset" ? setFilters({}) : setShowFilters(true)));
  const onDoublesE = useEvent((view = "feed") => pushList({ kind: "doubles", label: "Double features", view }));
  const onOpenWantE = useEvent((w) => setWantOpen(wantId(w)));
  const onNewWantE = useEvent(() => setWantOpen("new"));
  const onAddE = useEvent(() => setAdding({}));
  const onPushE = useEvent(pushList);
  const onFocusedE = useEvent(() => setSearchFocus(0));
  const onPersonE = useEvent(onPerson);
  const onLabelE = useEvent((l) => pushList({ kind: "label", label: l, test: (f) => f.copies.some((c) => c.label === l) }));
  const onDeckPinE = useEvent(pinDeck);
  const onDeckRemoveE = useEvent((x) => D.removeDeck(x.key));
  const onDeckPickE = useEvent(pickDeck);
  const onDeckAllE = useEvent(() => pushList({ kind: "deck", label: "On deck" }));

  return (
    <div className="app">
      {/* Everything under the film pages. It slides a third of the way left and dims while a film page
          is on top, like an iOS navigation stack, and glides back when you go back. */}
      <div className={"under" + (covered ? " covered" : "")}>
      <main hidden={tab !== "home"}>
        <HomeTab films={shelfFilms} defs={defs} recipes={recipes} filters={filters} home={home} setHome={setHome} active={tab === "home"}
          onOpen={openFilmE} onSeeAll={onSeeAllE} onSearch={onSearchE} onFilters={onFiltersE} onPair={setNight} onDoubles={onDoublesE} saved={D.programs.length}
          deck={deck} deckDays={deckDays} onDeckPin={onDeckPinE} onDeckRemove={onDeckRemoveE} onDeckPick={onDeckPickE} onDeckAll={onDeckAllE} />
      </main>
      {/* Tabs stay built in the background, so switching back is instant and keeps your place. */}
      <main hidden={tab !== "library"}><LibraryTab films={films} customTags={D.customTags} extra={extra} setExtra={setExtra} onOpen={openFilmE} onAdd={onAddE} searchFocus={searchFocus} onFocused={onFocusedE} reset={libReset} /></main>
      <main hidden={tab !== "you"}><YouTab films={shelfFilms} want={D.want} programs={D.programs} sync={sync} onOpen={openFilmE} onPush={onPushE} /></main>
      </div>
      <div className={"nav-dim" + (covered ? " on" : "")} aria-hidden="true" />
      {tab === "library" && !top && <BackToTop key={tab} />}

      {stack.slice(-2).map((e, i, arr) => {
        const isTop = i === arr.length - 1;
        const depth = stack.length - arr.length + i; // position in the whole stack
        const label = depth > 0 ? entryName(stack[depth - 1]) : TAB_NAMES[tab];
        const nav = isTop && leaving ? "leaving" : "in";
        const below = !isTop && !leaving;
        const page = (children) => <StackPage key={depth + ":" + e.id} nav={nav} below={below} label={e.label} backLabel={label} onBack={back}>{children}</StackPage>;
        if (typeof e !== "string" && e.kind === "deck") return page(<DeckPage deck={deck} days={deckDays} pair={deckPair} finish={finish} onOpen={openFilm} onPin={pinDeck}
          onRemove={(x) => D.removeDeck(x.key)} onKeep={(x) => D.keepDeck(x.key)} onPick={pickDeck} onAdd={() => setDeckAdd(true)} onPair={setNight} />);
        if (typeof e !== "string" && e.kind === "wishlist") return page(<Wishlist want={D.want} films={films} onOpenWant={onOpenWantE} onNew={onNewWantE} />);
        if (typeof e !== "string" && e.kind === "diary") return page(<Diary films={films} watchLog={D.watchLog} onOpen={openFilm} />);
        if (typeof e !== "string" && e.kind === "stats") return page(<Stats films={shelfFilms} onPerson={onPerson} onLabel={onLabelE} />);
        if (typeof e !== "string" && e.kind === "prefs") return page(<Prefs finish={finish} setFinish={setFinish} removed={removedFilms} onRestore={restoreFilm} />);
        if (typeof e !== "string" && e.kind === "tags") return page(<TagsView films={films} D={D} />);
        if (typeof e !== "string" && e.kind === "backup") return page(<div className="page"><div className="page-head"><h1>Backup &amp; sync</h1></div><Backup bare D={D} sync={sync} films={films} /></div>);
        if (typeof e !== "string" && e.kind === "doubles") {
          return <DoublesPage key={depth + ":" + e.id} nav={nav} below={below} entry={e} films={films} ix={ix} programs={D.programs} onNight={setNight} finish={finish} backLabel={label} onBack={back} />;
        }
        if (typeof e !== "string") {
          return <ListPage key={depth + ":" + e.id} nav={nav} below={below} entry={e} films={films} backLabel={label} onBack={back} onOpen={openFilm} />;
        }
        const f = byKey.get(e);
        if (!f) return null;
        return (
          <FilmPage key={depth + ":" + e} nav={nav} below={below} onPeek={setPeek} wanted={wanted}
            deckItem={deck.find((x) => x.key === f.key)} deckDays={deckDays} onDeckToggle={(film) => toggleDeck(film)} film={f} films={films} ix={ix} onNight={setNight} onBuildAround={buildAround} allTags={allTags} onAddTag={D.addTag} onRemoveTag={D.removeTag}
            onEditCopy={(c) => setCopyEdit({ key: f.key, copy: c })} onEditDetails={() => setDetailsFor(f.key)} backLabel={label} onBack={back} onOpen={openFilm} onPerson={onPerson}
            onUpdate={D.updateFilm} onLog={logFilm} onUnlog={D.unlogWatch} onRemove={removeFilm} onPicker={(t) => setPicking({ key: f.key, tab: t })} />
        );
      })}

      <nav className="tabbar" aria-label="Sections">
        <div className="tabbar-inner">
          {TABS.map(([k, l, ic]) => (
            <button key={k} className={"tab" + (tab === k ? " on" : "")} aria-current={tab === k ? "page" : undefined} onClick={() => goTab(k)}>
              <Icon d={ic} size={26} sw={tab === k ? 2 : 1.7} />{l}
            </button>
          ))}
        </div>
      </nav>

      {night && (
        <NightSheet key={night.key} pair={night} programs={D.programs} finish={finish} setFinish={setFinish}
          onSave={D.saveProgram} onDelete={D.removeProgram} onLog={logBoth}
          onOpenFilm={(f) => { setNight(null); openFilm(f); }} onClose={() => setNight(null)} />
      )}
      {copyEdit && byKey.get(copyEdit.key) && (
        <CopySheet film={byKey.get(copyEdit.key)} copy={copyEdit.copy} labels={labels} onNewLabel={D.addLabel} onClose={() => setCopyEdit(null)}
          onSave={(copies) => { D.updateFilm(copyEdit.key, { copies }); setCopyEdit(null); }} />
      )}
      {detailsFor && byKey.get(detailsFor) && <DetailsSheet film={byKey.get(detailsFor)} onUpdate={D.updateFilm} onClose={() => setDetailsFor(null)} />}
      {showFilters && <FilterSheet films={films} defs={defs} filters={filters} setFilters={setFilters} onClose={() => setShowFilters(false)} />}
      {picking && byKey.get(picking.key) && (
        <PosterPicker key={picking.key} film={byKey.get(picking.key)} startTab={picking.tab} onClose={() => setPicking(null)}
          onPick={(kind, v) => {
            if (kind === "pos") return D.updateFilm(picking.key, { backdropPos: v === "center" ? undefined : v });
            D.updateFilm(picking.key, kind === "poster" ? { poster: v } : { backdrop: v, backdropPos: undefined });
            if (kind === "poster") setPicking(null);
          }} />
      )}
      {wantOpen === "new" && <NewWantSheet onAdd={(w) => { D.addWant(w); setWantOpen(null); }} onClose={() => setWantOpen(null)} />}
      {wantOpen && wantOpen !== "new" && D.want.find((w) => wantId(w) === wantOpen) && (() => {
        const w = D.want.find((x) => wantId(x) === wantOpen);
        return (
          <WantSheet key={wantOpen} w={w} films={films} onUpdate={(patch) => D.updateWant(wantOpen, patch)} onRemove={() => D.removeWant(wantOpen)}
            onGot={() => {
              D.updateWant(wantOpen, { bought: true }); setWantOpen(null);
              const mine = films.find((f) => (f.name + "|" + f.year).toLowerCase() === wantOpen.toLowerCase());
              if (mine) setCopyEdit({ key: mine.key, copy: null }); // an upgrade: log the new copy on the film you have
              else if (!w.set) setAdding({ name: w.film, year: w.year, label: w.label });
            }}
            onOpenFilm={(f) => { setWantOpen(null); openFilm(f); }} onClose={() => setWantOpen(null)} />
        );
      })()}
      {peek && (
        <PeekSheet f={peek} wanted={wanted.has((peek.name + "|" + peek.year).toLowerCase())}
          onWant={() => D.addWant({ film: peek.name, year: peek.year, poster: peek.posterPath || undefined, tmdb: peek.tmdb, store: "", label: "" })}
          onOwn={() => { setPeek(null); setAdding({ name: peek.name, year: peek.year }); }} onClose={() => setPeek(null)} />
      )}
      {deckAdd && <DeckAddSheet films={films} onDeck={deckKeys} onToggle={(f) => toggleDeck(f, true)} onClose={() => setDeckAdd(false)} />}
      {logFor && byKey.get(logFor) && <LogSheet film={byKey.get(logFor)} onLog={logFilm} onUnlog={D.unlogWatch} onClose={() => setLogFor(null)} />}
      {press && byKey.get(press) && (() => {
        const f = byKey.get(press);
        return (
          <PressMenu f={f} inDeck={deckKeys.has(f.key)} onClose={() => setPress(null)} onDeck={() => toggleDeck(f)}
            onLog={() => setLogFor(f.key)} onDouble={() => buildAround(f)} onOpen={() => openFilm(f)} />
        );
      })()}
      <Toast toast={toast} onAction={() => { const t = toast; setToast(null); t?.run?.(); if (t?.go === "deck" && !(top && top.kind === "deck")) pushList({ kind: "deck", label: "On deck" }); }} />
      {adding && <AddSheet prefill={adding} existing={films} onAdd={(f) => {
        if (D.userData[fkey(f)]?.removed) restoreFilm(fkey(f)); // it was removed earlier: bring it back with its notes and copies
        if (!SEED_COLLECTION.some((x) => fkey(x) === fkey(f)) && !D.added.some((x) => fkey(x) === fkey(f))) D.addFilm({ ...f, addedAt: todayISO() });
        setAdding(null);
      }} onClose={() => setAdding(null)} />}
    </div>
  );
}
