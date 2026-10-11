import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import SEED_COLLECTION from "./collection.json";
import COLLECTIONS from "./collections.json";
import META from "./meta.json";
import { SEED_WANTLIST } from "./wantlist.js";
import {
  store, readJSON, fkey, img, tmdb, shapeTmdbMovie, todayISO, thisYear, fmtDate, runtimeLabel, stars,
  sortKey, letterOf, peopleLabel, hashStr, rng, shuffled, yearsSince, parseEdition, copyBadges, copyLine, money,
  FORMATS, PACKAGES, REGIONS, KNOWN_LABELS, canonicalLabel, newId,
} from "./lib.js";
import { TAGS, THEMES, makeFilters, filterTest, activeFilterLabels, buildRecipes, dealShelves } from "./shelves.js";
import { pairIndex, bestPairs, partnersFor, scorePair, nightPlan, reasonLine } from "./pairs.js";
import { flushSync } from "react-dom";
import "./styles.css";

// ════════════════════════════════════════════════════════════════════════
//  THE SHELF — j_ck's physical collection. "Archive" design.
//  Film data and images from TMDB (proxied through /api/tmdb).
// ════════════════════════════════════════════════════════════════════════

// ─── STORED DATA ────────────────────────────────────────────────────────
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

function useData() {
  const [userData, setUserData] = useStored("shelf-userdata", {});
  const [added, setAdded] = useStored("shelf-added", []);
  const [want, setWant] = useStored("shelf-want", () => SEED_WANTLIST.map((w) => ({ ...w, bought: false })));
  const [watchLog, setWatchLog] = useStored("shelf-watchlog", {});
  const [customTags, setCustomTags] = useStored("shelf-customtags", []);
  const [programs, setPrograms] = useStored("shelf-programs", []);
  const retag = (fn) => setUserData((d) => Object.fromEntries(Object.entries(d).map(([k, u]) => [k, u.tags ? { ...u, tags: fn(u.tags) } : u])));
  return {
    userData, added, want, watchLog, customTags, programs,
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
    logWatch: (k) => setWatchLog((w) => ({ ...w, [k]: todayISO() })),
    unlogWatch: (k) => setWatchLog((w) => { const { [k]: _, ...rest } = w; return rest; }),
    setWant,
    importAll: (p) => {
      if (p.userData) setUserData(p.userData);
      if (p.added) setAdded(p.added);
      if (p.want) setWant(p.want);
      if (p.watchLog) setWatchLog(p.watchLog);
      if (p.customTags) setCustomTags(p.customTags);
      if (p.programs) setPrograms(p.programs);
    },
    exportPayload: () => ({ userData, added, want, watchLog, customTags, programs }),
  };
}

function deriveFilm(raw, userData, watchLog) {
  const key = fkey(raw);
  const u = userData[key] || {};
  const f = u.match ? { ...raw, ...u.match } : raw; // "Fix the match" swaps in another film's TMDB data
  const copies = (u.copies || parseEdition(f.edition || "").map((c, i) => ({ ...c, id: "s" + i })))
    .map((c) => (c.label ? { ...c, label: canonicalLabel(c.label) } : c));
  const logged = watchLog[key];
  const views = f.views ? f.views.slice() : [];
  if (logged && !views.includes(logged)) views.push(logged);
  const lastWatched = [logged, f.lastWatched, views[views.length - 1]].filter(Boolean).sort().pop() || null;
  const sk = sortKey(f.name);
  const out = {
    ...f,
    key,
    tags: u.tags || [],
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
    // When it joined the shelf: earliest copy purchase date, else the day it was added here, else reconstructed history.
    addedOn: copies.map((c) => c.purchased).filter(Boolean).sort()[0] || f.addedAt || f.added || null,
    addedSince: f.addedSince || null,
    special: copies.some((c) => (c.package && c.package !== "Standard") || c.label),
    views, lastWatched,
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
  doubles: <><rect x="2.75" y="5" width="8.5" height="14" rx="1.5" /><rect x="12.75" y="5" width="8.5" height="14" rx="1.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" /></>,
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  wall: <><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="1" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="1" /><rect x="13" y="13" width="7.5" height="7.5" rx="1" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></>,
};

// ─── SHARED BITS ────────────────────────────────────────────────────────
function Poster({ path, title, size = "w342", className = "", eager = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);
  const src = img(path, size);
  return (
    <div className={"poster " + className}>
      {src && !failed
        ? <img src={src} alt="" loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />
        : <div className="poster-empty">{title}</div>}
    </div>
  );
}

// ─── MOTION ─────────────────────────────────────────────────────────────
// Screen changes run through the View Transitions API where the browser has it (iOS 18+):
// the poster you tapped flies into the film page and back, tabs crossfade, the tab bar stays put.
// Older browsers and Reduce Motion just get the instant change (plus the CSS push on film pages).
const reduceMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
// Where view transitions run, they own the film-page entrance; the CSS slide-in is only a fallback.
// (Toggling it per transition replayed the slide-in the moment a transition ended: a visible jitter.)
if (typeof document !== "undefined" && document.startViewTransition && !reduceMotion()) document.documentElement.dataset.vtOn = "";
function transition(kind, update, after) {
  if (!document.startViewTransition || reduceMotion()) { update(); after?.(); return; }
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
      if (mode !== "drag") { mode = null; return; }
      mode = null;
      const fast = raw / Math.max(1, Date.now() - t0) > 1 && raw > 90;
      el.style.transition = "transform 0.3s cubic-bezier(.2,.9,.3,1)";
      if (raw > Math.max(170, el.offsetHeight * 0.33) || fast) {
        el.style.transform = "translateY(100%)";
        el.parentElement.classList.add("leaving");
        setTimeout(onClose, 260);
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
  }, [onClose]);
  return (
    <div className={"scrim" + (leaving ? " leaving" : "")} onClick={close}>
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
    </div>
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
    let startY = null, pulling = false;
    const set = (v) => { pullRef.current = v; setPull(v); };
    const onStart = (e) => {
      if (busy.current || window.scrollY > 0 || document.body.style.overflow === "hidden") return;
      startY = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (startY == null) return;
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

function Home({ films, defs, recipes, filters, home, setHome, onOpen, onSeeAll, onSearch, onFilters, onPair, onDoubles, active }) {
  const eligible = useMemo(() => films.filter(filterTest(defs, filters)), [films, defs, filters]);
  const pick = pickFrom(eligible, home.date, home.pick);
  const extra = home.more || 0;
  const shelves = useMemo(() => dealShelves(recipes, hashStr(home.date) + home.seed * 104729, 6 + extra * 3), [recipes, home.date, home.seed, extra]);
  const canDealMore = shelves.length === 6 + extra * 3 && recipes.length > shelves.length;
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
                <button className="btn btn-outline" onClick={another} disabled={eligible.length < 2}>Pick another</button>
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
              <button className="link" onClick={(e) => (s.kind === "pairs" ? onDoubles() : onSeeAll(s, e.currentTarget))}>See all</button>
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
                  <button key={f.key} data-key={f.key} className="shelf-item" onClick={(e) => onOpen(f, e)}>
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
  return (
    <Sheet title="Tonight's filters" onClose={onClose} tall
      left={<button className="left" onClick={() => setFilters({})}>Reset</button>}
      foot={<button className="btn btn-primary" onClick={onClose} disabled={!matching}>{matching ? `Pick from ${matching} films` : "Nothing matches yet"}</button>}>
      {groups.map((g) => (
        <div key={g.key}>
          <div className="section-label">{g.label}</div>
          <div className="tag-row">
            {g.opts.map(({ o, l, n }) => {
              const on = filters[g.key] === o;
              return (
                <button key={o} className={"chip tnum" + (on ? " on" : "") + (!on && n === 0 ? " dim" : "")} aria-pressed={on} onClick={() => set(g.key, o)}>
                  {l} · {n}
                </button>
              );
            })}
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
const libGroups = (films, customTags) => {
  const has = (fn) => (f) => f.copies.some(fn);
  const formats = FORMATS.filter((x) => films.some(has((c) => c.format === x)));
  const pkgs = PACKAGES.filter((x) => x !== "Standard" && films.some(has((c) => c.package === x)));
  const labels = byCount(films.map((f) => f.copies.map((c) => c.label).filter(Boolean)));
  const atLeast = (n, lists) => { const all = byCount(lists); return all.filter((v) => lists.filter((l) => l.includes(v)).length >= n); };
  const decades = [...new Set(films.map((f) => Math.floor(f.yearNum / 10) * 10).filter(Boolean))].sort((a, b) => b - a);
  const genres = atLeast(2, films.map((f) => f.genres));
  const countries = atLeast(2, films.map((f) => f.countries));
  const directors = atLeast(2, films.map((f) => f.directors));
  return [
    ["format", "Format", [...formats.map((x) => [x, x, has((c) => c.format === x)]), ["none", "Not filled in", (f) => !f.copies.some((c) => c.format)]]],
    ["package", "Packaging", pkgs.map((x) => [x, x, has((c) => c.package === x)])],
    ["label", "Distributor", labels.map((x) => [x, x, has((c) => c.label === x)])],
    ["tag", "Tags", [...Object.entries(TAGS), ...customTags.map((t) => [t, t])].map(([k, l]) => [k, l, (f) => f.tags.includes(k)])],
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

const SORTS = {
  az: ["Title A–Z", (a, b) => a.sortKey.localeCompare(b.sortKey)],
  newest: ["Newest", (a, b) => b.yearNum - a.yearNum || a.sortKey.localeCompare(b.sortKey)],
  oldest: ["Oldest", (a, b) => a.yearNum - b.yearNum || a.sortKey.localeCompare(b.sortKey)],
  rating: ["Top rated", (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.sortKey.localeCompare(b.sortKey)],
  recent: ["Recently added", (a, b) => b.recency - a.recency],
  long: ["Longest runtime", (a, b) => (b.runtime || 0) - (a.runtime || 0)],
};

function Library({ films, customTags, extra, setExtra, onOpen, onAdd, onSettings, searchFocus, onFocused }) {
  const groups = useMemo(() => libGroups(films, customTags), [films, customTags]);
  const [sel, setSel] = useState({});
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
  const [sort, setSort] = useState(() => (SORTS[store.get("shelf-sort")] ? store.get("shelf-sort") : "az"));
  const [view, setView] = useState(() => store.get("shelf-libview") || "wall");
  const [cols, setCols] = useState(() => +store.get("shelf-wallcols") || 4);
  const changeView = (v) => { setView(v); store.set("shelf-libview", v); };
  const changeCols = (n) => { const c = Math.max(2, Math.min(6, n)); setCols(c); store.set("shelf-wallcols", String(c)); };
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

  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    const test = selTest(active);
    return films
      .filter((f) => test(f) && (!extra || extra.test(f)))
      .filter((f) => !query || f.name.toLowerCase().includes(query) || f.year === query
        || [...f.directors, ...f.cast, ...f.dop, ...f.music].some((n) => n.toLowerCase().includes(query)))
      .sort(SORTS[byRecent ? "recent" : sort][1]);
  }, [films, active, extra, query, sort, byRecent]);
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
            <button className="icon-btn" onClick={onSettings} aria-label="Backup, tags and want list"><Icon d={I.gear} size={21} sw={1.9} /></button>
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
            {list.length === films.length ? `${list.length} films` : `${list.length} of ${films.length}`}
            {(nActive > 0 || extra) && <button className="link" onClick={() => reflow(() => { setSel({}); setExtra(null); })}>Clear</button>}
          </span>
          {view === "wall" && (
            <span className="density" role="group" aria-label="Poster size">
              {[["Large", 3], ["Medium", 4], ["Small", 5]].map(([l, n]) => (
                <button key={n} className={cols === n ? "on" : ""} aria-pressed={cols === n} onClick={() => changeCols(n)} aria-label={l + " posters"}>
                  <i style={{ width: 4 + (6 - n) * 2, height: 6 + (6 - n) * 3 }} />
                </button>
              ))}
            </span>
          )}
          <label className="sort">
            {SORTS[byRecent ? "recent" : sort][0]}<Icon d={I.down} size={12} sw={2.6} />
            <select value={sort} onChange={(e) => { setSort(e.target.value); store.set("shelf-sort", e.target.value); }} aria-label="Sort by">
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
              <button key={f.key} data-key={f.key} id={grouped && i === 0 ? "L-" + g.letter : undefined} onClick={(e) => onOpen(f, e)} aria-label={`${f.name} (${f.year})`}>
                <Poster path={f.posterPath} title={f.name} size={cols >= 5 ? "w185" : "w342"} />
              </button>
            )))}
          </div>
        )}
        {view === "list" && letters.map((g) => (
          <div key={g.letter || "all"}>
            {g.letter && <div className="letter" id={"L-" + g.letter}>{g.letter}</div>}
            {g.films.map((f) => (
              <button key={f.key} data-key={f.key} className="film-row" onClick={(e) => onOpen(f, e)}>
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
        <LibraryFilter films={extra ? films.filter(extra.test) : films} groups={groups} sel={sel} active={active}
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
function useDirector(film) {
  const name = film.directors[0];
  const [info, setInfo] = useState(() => peopleCache[name] || null);
  useEffect(() => {
    setInfo(peopleCache[name] || null);
    if (peopleCache[name] || !film.tmdb || film.tmdbType === "tv") return;
    let dead = false;
    (async () => {
      try {
        const m = await tmdb(`/movie/${film.tmdb}`, { append_to_response: "credits" });
        const crew = (m.credits?.crew || []).find((c) => c.job === "Director" && c.name === name) || (m.credits?.crew || []).find((c) => c.job === "Director");
        if (!crew) return;
        const p = await tmdb(`/person/${crew.id}`);
        const out = { id: crew.id, photo: p.profile_path || crew.profile_path || null, born: p.birthday || null, died: p.deathday || null, place: p.place_of_birth || null, bio: (p.biography || "").trim() };
        peopleCache[name] = out;
        store.set("shelf-people", JSON.stringify(peopleCache));
        if (!dead) setInfo(out);
      } catch {}
    })();
    return () => { dead = true; };
  }, [name, film.tmdb]);
  return info;
}

function DirectorCard({ film, films, onOpen, onPerson }) {
  const name = film.directors[0];
  const info = useDirector(film);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [film.key]);
  const theirs = films.filter((f) => f.directors.includes(name));
  const rated = theirs.filter((f) => f.rating != null);
  const avg = rated.length ? rated.reduce((n, f) => n + f.rating, 0) / rated.length : null;
  const rank = META.rankedDirectors.findIndex((d) => d.name === name);
  const others = theirs.filter((f) => f.key !== film.key).sort((a, b) => b.yearNum - a.yearNum);
  const year = (d) => (d ? d.slice(0, 4) : null);
  const dates = info?.born ? (info.died ? `${year(info.born)}–${year(info.died)}` : `Born ${year(info.born)}`) : null;
  const place = info?.place ? info.place.split(",").map((x) => x.trim()).slice(0, 2).join(", ") : null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const bio = info?.bio || "";
  const short = bio.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  return (
    <section className="director">
      <div className="section-label">{film.directors.length > 1 ? "Directed by" : "Director"}</div>
      <button className="director-head" onClick={() => onPerson(name)} aria-label={`${name}: everything on your shelf`}>
        <span className="director-photo">
          {info?.photo && !photoFailed ? <img src={img(info.photo, "w185")} alt="" onError={() => setPhotoFailed(true)} /> : <span>{name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>}
        </span>
        <span className="director-text">
          <strong>{peopleLabel(film.directors)}</strong>
          {(dates || place) && <span className="muted">{[dates, place].filter(Boolean).join(" · ")}</span>}
          <span className="director-stats tnum">
            <span><b>{theirs.length}</b> on your shelf</span>
            {avg != null && <span><b>{avg.toFixed(1)}★</b> your average</span>}
            {rank >= 0 && <span><b>#{rank + 1}</b> in your rankings</span>}
          </span>
        </span>
        <Icon d={I.chev} size={16} sw={2.4} />
      </button>
      {bio && (
        <p className={"director-bio" + (open ? " open" : "")} onClick={() => setOpen(!open)}>
          {open ? bio : short}{!open && bio.length > short.length && <span className="accent"> More</span>}
        </p>
      )}
      {others.length > 0 && (
        <div className="shelf-row" style={{ margin: "4px -20px 0" }}>
          {others.map((f) => (
            <button key={f.key} className="shelf-item" onClick={() => onOpen(f)}>
              <Poster path={f.posterPath} title={f.name} size="w185" />
              <span>{f.year}{f.rating != null ? " · " + stars(f.rating) : ""}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── FILM PAGE ──────────────────────────────────────────────────────────
function FilmPage({ film, films, ix, onNight, onBuildAround, allTags, backLabel, onBack, onOpen, onPerson, onUpdate, onLog, onUnlog, onRemove, onPicker, onAddTag, onRemoveTag, onEditCopy, onEditDetails }) {
  const [note, setNote] = useState(film.note);
  const [newTag, setNewTag] = useState(null);
  const [editTags, setEditTags] = useState(false);
  const [editThemes, setEditThemes] = useState(false);
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
  const ref = useRef(null);
  useEffect(() => { setNote(film.note); setNewTag(null); setEditTags(false); setEditThemes(false); setDoomed(null); ref.current?.scrollTo(0, 0); }, [film.key]);
  const createTag = () => {
    const t = (newTag || "").trim().replace(/\s+/g, " ");
    if (t) { onAddTag(t); if (!film.tags.includes(t)) onUpdate(film.key, { tags: [...film.tags, t] }); }
    setNewTag(null);
  };
  // Swipe right anywhere on the page to go back, like iOS.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sx = 0, sy = 0, t0 = 0, mode = null, dx = 0;
    const set = (x, animate) => {
      el.style.transition = animate ? "transform 0.25s cubic-bezier(.2,.9,.3,1), box-shadow 0.25s" : "none";
      el.style.transform = x ? `translateX(${x}px)` : "";
      el.style.boxShadow = x ? "-12px 0 32px rgba(0,0,0,0.5)" : "";
    };
    const start = (e) => {
      if (e.touches.length !== 1 || e.target.closest(".shelf-row, input, textarea, select, .scrim")) { mode = "off"; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now(); mode = null; dx = 0;
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
      if (mode !== "h") { mode = null; return; }
      mode = null;
      const w = el.clientWidth || window.innerWidth;
      const fast = dx / Math.max(1, Date.now() - t0) > 0.5 && dx > 40;
      if (dx > w * 0.33 || fast) {
        set(w, true);
        setTimeout(() => { set(0, false); onBack({ swiped: true }); }, 220);
      } else set(0, true);
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
  }, [onBack]);
  const confirmCopies = () => onUpdate(film.key, { copies: film.copies.map(({ id, ...c }) => ({ ...c, id: newId() })) });

  const today = todayISO();
  const loggedToday = film.lastWatched === today;
  const pairsWith = useMemo(() => (ix ? partnersFor(ix, film, 3) : []), [ix, film]);
  const owned = useMemo(() => new Set(films.map((f) => f.tmdb)), [films]);
  const coll = film.collection && COLLECTIONS[film.collection];
  const collOwned = coll ? coll.parts.filter((p) => owned.has(p[0])).length : 0;
  const toggleTag = (t) => onUpdate(film.key, { tags: film.tags.includes(t) ? film.tags.filter((x) => x !== t) : [...film.tags, t] });

  return (
    <div className="film-page" ref={ref} role="dialog" aria-label={film.name}>
      <div className="film-inner">
        <div className="film-hero">
          {film.backdrop && <img src={img(film.backdrop, "w780")} alt="" style={{ objectPosition: "center " + film.backdropPos }} />}
          {film.tmdb && <button className="icon-btn glass banner-edit" onClick={() => onPicker("banner")} aria-label="Change banner"><Icon d={I.image} size={17} sw={2} /></button>}
          <button className="back" onClick={onBack}><Icon d={I.back} size={20} sw={2.4} /><span>{backLabel}</span></button>
        </div>

        <div className="film-head">
          <button onClick={() => onPicker("poster")} aria-label="Change poster" disabled={!film.tmdb}>
            <Poster path={film.posterPath} title={film.name} eager />
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
          </div>
        </div>

        <div className="film-body">
          <div className="btn-row">
            <button className={"btn " + (loggedToday ? "btn-done" : "btn-primary")} onClick={() => (loggedToday ? onUnlog(film.key) : onLog(film.key))} aria-pressed={loggedToday}>
              {loggedToday ? <><Icon d={I.check} size={16} sw={2.6} />Watched today</> : "Watched today"}
            </button>
            <button className="btn btn-outline" onClick={() => onPicker("poster")} disabled={!film.tmdb}>Poster & banner</button>
          </div>

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
                  {(c.note || c.region || c.price != null || c.purchased) && (
                    <span className="muted" style={{ display: "block", fontSize: 13, marginTop: 2 }}>
                      {[c.note, c.region && "Region " + c.region, c.purchased && fmtDate(c.purchased), c.price != null && c.price !== "" && money(c.price)].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="chev"><Icon d={I.chev} size={14} sw={2.4} /></span>
              </button>
            ))}
          </section>

          {film.directors.length > 0 && <DirectorCard film={film} films={films} onOpen={onOpen} onPerson={onPerson} />}

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
                ? <button className="chip chip-x" style={{ color: "var(--accent)", borderStyle: "dashed" }} onClick={() => setNewTag("")}><Icon d={I.plus} size={13} sw={2.6} />New tag</button>
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
            {film.userAdded && <button className="danger" onClick={() => { onRemove(film.key); onBack(); }}>Remove from collection</button>}
          </div>
        </div>
      </div>
    </div>
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
function CopySheet({ film, copy, labels, onSave, onClose }) {
  const isNew = !copy;
  const [c, setC] = useState(() => copy ? { ...copy, price: copy.price ?? "" } : { id: newId(), format: "", package: "Standard", label: "", region: "", purchased: "", price: "", note: "" });
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const clean = (x) => {
    const out = { ...x, id: x.id.startsWith("s") ? newId() : x.id, label: canonicalLabel((x.label || "").trim()), note: (x.note || "").trim() };
    const n = parseFloat(String(x.price).replace(/[$,]/g, ""));
    if (isNaN(n)) delete out.price; else out.price = n;
    if (!out.purchased) delete out.purchased;
    if (!out.region) delete out.region;
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
      <div><span className="field-label">Package</span><Chips k="package" opts={PACKAGES} /></div>
      <div>
        <label className="field-label" htmlFor="copy-label">Label or distributor</label>
        <input id="copy-label" className="field" list="label-list" value={c.label} onChange={(e) => set("label", e.target.value)} placeholder="Criterion, Arrow, Vinegar Syndrome…" autoComplete="off" />
        <datalist id="label-list">{labels.map((l) => <option key={l} value={l} />)}</datalist>
      </div>
      <div><span className="field-label">Region</span><Chips k="region" opts={REGIONS} allowNone /></div>
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
      formats: ["4K", "Blu-ray", "DVD", "Other"].map((fm) => [fm, films.reduce((a, f) => a + f.copies.filter((c) => c.format === fm).length, 0)]).filter(([, n]) => n),
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
  const plan = nightPlan(p.a, p.b, finish);
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

function Doubles({ films, ix, programs, view, setView, anchor, setAnchor, onNight, finish }) {
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
  const pick = (f) => { setAnchor(f.key); setQ(""); window.scrollTo(0, 0); };

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
            <button className="filter-btn" style={{ fontSize: 14, flexShrink: 0 }} onClick={() => { setSeed(seed + 1); setShown(10); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
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
  const plan = nightPlan(first, second, finish);
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
          <div className="list-row"><span className="grow muted">Running time, with a 15-minute break</span><span className="tnum">{runtimeShort(plan.total)}</span></div>
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
function Backup({ D, films, onBuy, bare }) {
  const [renaming, setRenaming] = useState(null);
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState(""); const [ny, setNy] = useState(""); const [nl, setNl] = useState("");
  const owned = useMemo(() => new Set(films.map((f) => f.name + "|" + f.year)), [films]);

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
  const want = D.want;
  const toggle = (i) => D.setWant(want.map((w, j) => (j === i ? { ...w, bought: !w.bought } : w)));
  const remove = (i) => D.setWant(want.filter((_, j) => j !== i));
  const add = () => {
    if (!nf.trim()) return;
    D.setWant([{ film: nf.trim(), year: ny.trim(), label: nl.trim(), note: "", kind: "new", bought: false }, ...want]);
    setNf(""); setNy(""); setNl(""); setAdding(false);
  };
  const kinds = { upgrade: "Upgrade", new: "New", gap: "Gap" };
  const row = (label, n) => <div className="list-row"><span className="grow muted">{label}</span><span className="tnum">{n}</span></div>;

  return (
    <div className={bare ? "" : "page"} style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {!bare && <div className="page-head"><h1>Backup</h1></div>}
      <section className="stat-section" style={{ gap: 0, marginTop: bare ? 0 : -14 }}>
        {row("Films", films.length)}
        {row("Added here", films.filter((f) => f.userAdded).length)}
        {row("Tagged", Object.values(D.userData).filter((u) => u.tags && u.tags.length).length)}
        {row("Custom posters", Object.values(D.userData).filter((u) => u.poster).length)}
        {row("Films with copy details", Object.values(D.userData).filter((u) => u.copies && u.copies.length).length)}
        {row("Watches logged here", Object.keys(D.watchLog).length)}
        {row("Double features saved", D.programs.length)}
      </section>

      <section className="stat-section">
        <div className="btn-row" style={{ flexDirection: "column" }}>
          <button className="btn btn-primary" style={{ height: 46 }} onClick={doExport}>Export backup</button>
          <button className="btn btn-outline" style={{ height: 46 }} onClick={() => fileRef.current.click()}>Restore from backup</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={doImport} style={{ display: "none" }} />
        <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{msg || "Tags, notes, poster choices, double features, films added here, the want list and watch log live only on this device. Export now and then, and always before clearing Safari."}</span>
      </section>

      <section className="stat-section" style={{ gap: 0 }}>
        <h2 style={{ marginBottom: 6 }}>Your tags</h2>
        {Object.entries(TAGS).map(([k, l]) => (
          <div className="list-row" key={k}><span className="grow">{l}</span><span className="muted tnum">{films.filter((f) => f.tags.includes(k)).length}</span></div>
        ))}
        {D.customTags.map((t) => (
          <div className="list-row" key={t}>
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
                <span className="grow">{t} <span className="muted tnum">· {films.filter((f) => f.tags.includes(t)).length}</span></span>
                <button className="link" style={{ fontSize: 14 }} onClick={() => setRenaming({ from: t, to: t })}>Rename</button>
                <button style={{ fontSize: 14, color: "var(--danger)" }} onClick={() => D.removeTag(t)}>Remove</button>
              </>
            )}
          </div>
        ))}
        <span className="muted" style={{ fontSize: 13, marginTop: 8 }}>{D.customTags.length ? "Removing a tag takes it off every film." : "Make your own tags from any film's page, under Tags."}</span>
      </section>

      <section className="stat-section" style={{ gap: 0 }}>
        <div className="stat-head" style={{ marginBottom: 6 }}>
          <h2>Want list</h2>
          <button className="link" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Track a release"}</button>
        </div>
        {adding && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "6px 0 12px" }}>
            <input className="field" value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Title" aria-label="Title" autoFocus />
            <div style={{ display: "flex", gap: 8 }}>
              <input className="field" style={{ width: 96 }} value={ny} onChange={(e) => setNy(e.target.value)} placeholder="Year" aria-label="Year" inputMode="numeric" />
              <input className="field" value={nl} onChange={(e) => setNl(e.target.value)} placeholder="Edition, e.g. Arrow 4K" aria-label="Edition" />
            </div>
            <button className="btn btn-primary" onClick={add}>Add to want list</button>
          </div>
        )}
        {want.length === 0 && <div className="empty">Nothing on the want list.</div>}
        {want.map((w, i) => (
          <div className="list-row" key={i + w.film} style={{ alignItems: "flex-start" }}>
            <button className={"check" + (w.bought ? " on" : "")} aria-pressed={w.bought} aria-label={(w.bought ? "Unmark " : "Mark ") + w.film + " as bought"} onClick={() => toggle(i)}>
              {w.bought && <Icon d={I.check} size={13} sw={3.2} />}
            </button>
            <div className="grow" style={{ whiteSpace: "normal", opacity: w.bought ? 0.5 : 1 }}>
              {w.film} <span className="muted tnum">{w.year}</span>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{[w.label, kinds[w.kind]].filter(Boolean).join(" · ")}</div>
              {!w.bought && w.kind !== "upgrade" && owned.has(w.film + "|" + w.year) && <div className="accent" style={{ fontSize: 13, marginTop: 2 }}>Already on your shelf</div>}
              <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
                {w.bought && <button className="link" style={{ fontSize: 14 }} onClick={() => onBuy(w)}>Add to shelf</button>}
                <button style={{ fontSize: 14, color: "var(--danger)" }} onClick={() => remove(i)}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <p className="foot">Film data and images from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
  );
}

// ─── ROOT ───────────────────────────────────────────────────────────────
const TABS = [["home", "Home", I.home], ["library", "Library", I.library], ["doubles", "Doubles", I.doubles], ["stats", "Stats", I.stats]];
const TAB_NAMES = Object.fromEntries(TABS.map(([k, l]) => [k, l]));

export default function App() {
  const D = useData();
  const [tab, setTab] = useState("home");
  const [stack, setStack] = useState([]);
  const [extra, setExtra] = useState(null);
  const [adding, setAdding] = useState(null);
  const [picking, setPicking] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const [filters, setFilters] = useStored("shelf-filters", {});
  const [home, setHome] = useHomeState();

  const films = useMemo(() => {
    const seedKeys = new Set(SEED_COLLECTION.map(fkey));
    return [...SEED_COLLECTION, ...D.added.filter((f) => !seedKeys.has(fkey(f)))].map((f) => deriveFilm(f, D.userData, D.watchLog));
  }, [D.added, D.userData, D.watchLog]);
  useMemo(() => { [...films].sort((a, b) => b.recency - a.recency).forEach((f, i) => { f.recentRank = i + 1; }); }, [films]);
  const byKey = useMemo(() => new Map(films.map((f) => [f.key, f])), [films]);
  const ix = useMemo(() => pairIndex(films), [films]);
  const homePairs = useMemo(() => bestPairs(ix, 60), [ix]);
  const recipes = useMemo(() => buildRecipes(films, D.customTags, homePairs), [films, D.customTags, homePairs]);
  const [dblView, setDblView] = useState("feed");
  const [anchor, setAnchor] = useState(null);
  const [night, setNight] = useState(null);
  const [settings, setSettings] = useState(false);
  const [finish, setFinish] = useStored("shelf-finishby", 23);
  const defs = useMemo(() => makeFilters(D.customTags), [D.customTags]);
  const allTags = useMemo(() => [...Object.entries(TAGS), ...D.customTags.map((t) => [t, t])], [D.customTags]);
  const labels = useMemo(() => [...new Set([...KNOWN_LABELS, ...films.flatMap((f) => f.copies.map((c) => c.label).filter(Boolean))])].sort(), [films]);
  const [copyEdit, setCopyEdit] = useState(null);
  const [detailsFor, setDetailsFor] = useState(null);

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

  const top = stack.length ? byKey.get(stack[stack.length - 1]) : null;
  useBodyLock(!!top || !!adding || !!picking || showFilters || !!copyEdit || !!detailsFor || !!night || settings);

  const openFilm = (f, e) => {
    const push = () => setStack((s) => (s[s.length - 1] === f.key ? s : [...s, f.key]));
    const el = e?.currentTarget?.querySelector?.(".poster");
    if (!el) return transition("push", push);
    // Name the tapped poster for the old snapshot, then hand the name to the film page's poster.
    el.style.viewTransitionName = "film-poster";
    transition("morph", () => { el.style.viewTransitionName = ""; push(); });
  };
  const back = (opts) => {
    const leaving = stack[stack.length - 1];
    const pop = () => setStack((s) => s.slice(0, -1));
    if (opts?.swiped || !leaving) return pop();
    let target = null;
    const t = transition("pop", pop, () => {
      // Back to the grid or shelf: fly the poster home if its spot is on screen.
      if (stack.length > 1) return;
      target = posterFor(leaving);
      if (target) target.style.viewTransitionName = "film-poster";
    });
    t?.finished.finally(() => { if (target) target.style.viewTransitionName = ""; });
  };
  const goTab = (t) => {
    if (t === tab) { setStack([]); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    forgetScroll();
    transition("tab", () => { setStack([]); setTab(t); window.scrollTo(0, 0); });
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
  const onPerson = (name) => toLibrary({ label: name, test: (f) => f.directors.includes(name) || f.dop.includes(name) || f.music.includes(name) || f.cast.includes(name) });
  const buildAround = (f) => { forgetScroll(); setAnchor(f.key); setDblView("build"); setStack([]); setNight(null); setTab("doubles"); window.scrollTo(0, 0); };
  const logBoth = (a, b, program) => {
    D.logWatch(a.key); D.logWatch(b.key);
    if (program) D.saveProgram({ ...program, watched: todayISO() });
  };
  const backLabel = stack.length > 1 ? (byKey.get(stack[stack.length - 2])?.name || "Back") : TAB_NAMES[tab];

  return (
    <div className="app">
      <main hidden={tab !== "home"}>
        <Home films={films} defs={defs} recipes={recipes} filters={filters} home={home} setHome={setHome} active={tab === "home" && !top}
          onOpen={openFilm} onSeeAll={(s, el) => toLibrary({ label: s.title, test: s.test }, el)}
          onSearch={() => { toLibrary(null); setSearchFocus((n) => n + 1); }}
          onFilters={(x) => (x === "reset" ? setFilters({}) : setShowFilters(true))}
          onPair={setNight} onDoubles={() => { setDblView("feed"); goTab("doubles"); }} />
      </main>
      {tab === "library" && <main><Library films={films} customTags={D.customTags} extra={extra} setExtra={setExtra} onOpen={openFilm} onAdd={() => setAdding({})} onSettings={() => setSettings(true)} searchFocus={searchFocus} onFocused={() => setSearchFocus(0)} /></main>}
      {tab === "stats" && <main><Stats films={films} onPerson={onPerson} onLabel={(l) => toLibrary({ label: l, test: (f) => f.copies.some((c) => c.label === l) })} /></main>}
      {(tab === "library" || tab === "doubles" || tab === "stats") && !top && <BackToTop key={tab} />}
      {tab === "doubles" && <main><Doubles films={films} ix={ix} programs={D.programs} view={dblView} setView={setDblView} anchor={anchor} setAnchor={setAnchor} onNight={setNight} finish={finish} /></main>}

      {top && (
        <FilmPage key="film" film={top} films={films} ix={ix} onNight={setNight} onBuildAround={buildAround} allTags={allTags} onAddTag={D.addTag} onRemoveTag={D.removeTag}
          onEditCopy={(c) => setCopyEdit({ key: top.key, copy: c })} onEditDetails={() => setDetailsFor(top.key)} backLabel={backLabel} onBack={back} onOpen={openFilm} onPerson={onPerson}
          onUpdate={D.updateFilm} onLog={D.logWatch} onUnlog={D.unlogWatch} onRemove={D.removeFilm} onPicker={(t) => setPicking({ key: top.key, tab: t })} />
      )}

      <nav className="tabbar" aria-label="Sections">
        <div className="tabbar-inner">
          {TABS.map(([k, l, ic]) => (
            <button key={k} className={"tab" + (tab === k && !top ? " on" : "")} aria-current={tab === k ? "page" : undefined} onClick={() => goTab(k)}>
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
      {settings && (
        <Sheet title="Backup & lists" onClose={() => setSettings(false)} tall>
          <Backup bare D={D} films={films} onBuy={(w) => { setSettings(false); setAdding({ name: w.film, year: w.year, label: w.label }); }} />
        </Sheet>
      )}
      {copyEdit && byKey.get(copyEdit.key) && (
        <CopySheet film={byKey.get(copyEdit.key)} copy={copyEdit.copy} labels={labels} onClose={() => setCopyEdit(null)}
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
      {adding && <AddSheet prefill={adding} existing={films} onAdd={(f) => { D.addFilm({ ...f, addedAt: todayISO() }); setAdding(null); }} onClose={() => setAdding(null)} />}
    </div>
  );
}
