import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import SEED_COLLECTION from "./collection.json";
import COLLECTIONS from "./collections.json";
import META from "./meta.json";
import { SEED_WANTLIST } from "./wantlist.js";
import {
  store, readJSON, fkey, img, tmdb, shapeTmdbMovie, todayISO, thisYear, fmtDate, runtimeLabel, stars,
  sortKey, letterOf, peopleLabel, hashStr, rng, yearsSince, parseEdition, copyBadges, copyLine, money,
  FORMATS, PACKAGES, REGIONS, KNOWN_LABELS, newId,
} from "./lib.js";
import { TAGS, makeFilters, filterTest, activeFilterLabels, buildRecipes, dealShelves } from "./shelves.js";
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
  const retag = (fn) => setUserData((d) => Object.fromEntries(Object.entries(d).map(([k, u]) => [k, u.tags ? { ...u, tags: fn(u.tags) } : u])));
  return {
    userData, added, want, watchLog, customTags,
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
    },
    exportPayload: () => ({ userData, added, want, watchLog, customTags }),
  };
}

function deriveFilm(raw, userData, watchLog) {
  const key = fkey(raw);
  const u = userData[key] || {};
  const f = u.match ? { ...raw, ...u.match } : raw; // "Fix the match" swaps in another film's TMDB data
  const copies = u.copies || parseEdition(f.edition || "").map((c, i) => ({ ...c, id: "s" + i }));
  const logged = watchLog[key];
  const views = f.views ? f.views.slice() : [];
  if (logged && !views.includes(logged)) views.push(logged);
  const lastWatched = [logged, f.lastWatched, views[views.length - 1]].filter(Boolean).sort().pop() || null;
  const sk = sortKey(f.name);
  return {
    ...f,
    key,
    tags: u.tags || [],
    note: u.note || "",
    customPoster: u.poster || null,
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

function Sheet({ title, onClose, left, right, tall, children, foot }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={"sheet" + (tall ? " tall" : "")} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="grabber" />
          <div className="sheet-bar">
            <span>{left}</span>
            <h2>{title}</h2>
            <span style={{ justifySelf: "end" }}>{right || <button className="right" onClick={onClose}>Done</button>}</span>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>
  );
}

const useBodyLock = (on) => useEffect(() => {
  if (!on) return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => { document.body.style.overflow = prev; };
}, [on]);

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

function Home({ films, defs, recipes, filters, home, setHome, onOpen, onSeeAll, onSearch, onFilters, active }) {
  const eligible = useMemo(() => films.filter(filterTest(defs, filters)), [films, defs, filters]);
  const pick = pickFrom(eligible, home.date, home.pick);
  const shelves = useMemo(() => dealShelves(recipes, hashStr(home.date) + home.seed * 104729), [recipes, home.date, home.seed]);
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
    setHome((h) => ({ ...h, seed: h.seed + 1, pick: h.pick + 1 }));
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
              <img key={pick.backdrop} src={img(pick.backdrop, "w780")} srcSet={`${img(pick.backdrop, "w780")} 780w, ${img(pick.backdrop, "w1280")} 1280w`}
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
                <p>{s.films.length} {s.kind === "person" ? "on your shelf" : "films"}</p>
              </div>
              <button className="link" onClick={() => onSeeAll(s)}>See all</button>
            </div>
            <div className="shelf-row">
              {s.deal.map((f) => (
                <button key={f.key} className="shelf-item" onClick={() => onOpen(f)}>
                  <Poster path={f.posterPath} title={f.name} size="w185" />
                  <span>{s.sub(f)}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
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
const libGroups = (films, customTags) => {
  const has = (fn) => (f) => f.copies.some(fn);
  const formats = FORMATS.filter((x) => films.some(has((c) => c.format === x)));
  const pkgs = PACKAGES.filter((x) => x !== "Standard" && films.some(has((c) => c.package === x)));
  const labels = byCount(films.map((f) => f.copies.map((c) => c.label).filter(Boolean)));
  return [
    ["format", "Format", [...formats.map((x) => [x, x, has((c) => c.format === x)]), ["none", "Not filled in", (f) => !f.copies.some((c) => c.format)]]],
    ["package", "Packaging", pkgs.map((x) => [x, x, has((c) => c.package === x)])],
    ["label", "Distributor", labels.map((x) => [x, x, has((c) => c.label === x)])],
    ["tag", "Tags", [...Object.entries(TAGS), ...customTags.map((t) => [t, t])].map(([k, l]) => [k, l, (f) => f.tags.includes(k)])],
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
const SHORTCUTS = [["format", "4K"], ["package", "Steelbook"], ["watch", "five"], ["shelf", "recent"], ["watch", "never"], ["shelf", "special"]];

const SORTS = {
  az: ["Title A–Z", (a, b) => a.sortKey.localeCompare(b.sortKey)],
  newest: ["Newest", (a, b) => b.yearNum - a.yearNum || a.sortKey.localeCompare(b.sortKey)],
  oldest: ["Oldest", (a, b) => a.yearNum - b.yearNum || a.sortKey.localeCompare(b.sortKey)],
  rating: ["Top rated", (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.sortKey.localeCompare(b.sortKey)],
  recent: ["Recently added", (a, b) => b.recency - a.recency],
  long: ["Longest runtime", (a, b) => (b.runtime || 0) - (a.runtime || 0)],
};

function Library({ films, customTags, extra, setExtra, onOpen, onAdd, searchFocus, onFocused }) {
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
  const [view, setView] = useState(() => store.get("shelf-libview") || "list");
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

  const fives = films.filter((f) => f.rating === 5).length;
  const never = films.filter((f) => !f.lastWatched).length;
  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    const test = selTest(active);
    return films
      .filter((f) => test(f) && (!extra || extra.test(f)))
      .filter((f) => !query || f.name.toLowerCase().includes(query) || f.year === query
        || f.directors.some((d) => d.toLowerCase().includes(query)) || f.cast.some((c) => c.toLowerCase().includes(query)))
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
          </div>
        </div>
        <label className="search">
          <Icon d={I.search} size={16} sw={2.2} />
          <input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, director, actor or year" aria-label="Search the library" />
          {q && <button onClick={() => setQ("")} aria-label="Clear search" style={{ color: "var(--label-2)", display: "grid" }}><Icon d={I.close} size={14} sw={2.4} /></button>}
        </label>
        <div className="strip">
          <div><b>{films.length}</b><span>Films</span></div>
          <div><b>{fives}</b><span>Rated five stars</span></div>
          <div><b>{never}</b><span>Never logged</span></div>
        </div>
        <div className="chips">
          <button className={"chip chip-x filter-btn" + (nActive ? " active" : "")} onClick={() => setFiltering(true)} aria-label={nActive ? `Filter, ${nActive} on` : "Filter"}>
            <Icon d={I.sliders} size={15} sw={2} />Filter{nActive > 0 && <span className="count tnum">{nActive}</span>}
          </button>
          {extra && (
            <button className="chip on chip-x" onClick={() => setExtra(null)} aria-label={"Remove filter " + extra.label}>
              {extra.label}<Icon d={I.close} size={12} sw={2.6} />
            </button>
          )}
          {active.flatMap(([g, , opts]) => opts.map(([k, l]) => (
            <button key={g + k} className="chip on chip-x" onClick={() => toggle(g, k)} aria-label={"Remove filter " + l}>
              {l}<Icon d={I.close} size={12} sw={2.6} />
            </button>
          )))}
          {!nActive && !extra && SHORTCUTS.map(([g, k]) => {
            const opt = groups.find((x) => x[0] === g)?.[2].find((o) => o[0] === k);
            return opt && <button key={g + k} className="chip" onClick={() => toggle(g, k)}>{opt[1]}</button>;
          })}
        </div>
        <div className="lib-bar">
          <span className="tnum">{list.length === films.length ? `${list.length} films` : `${list.length} of ${films.length} films`}</span>
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
              {(q || nActive > 0 || extra) && <button className="link" onClick={() => { setQ(""); setSel({}); setExtra(null); }}>Clear filters</button>}
              <button className="link" onClick={onAdd}>Add a film</button>
            </div>
          </div>
        )}
        {view === "wall" && list.length > 0 && (
          <div className="wall" style={{ "--cols": cols }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
            {letters.flatMap((g) => g.films.map((f, i) => (
              <button key={f.key} id={grouped && i === 0 ? "L-" + g.letter : undefined} onClick={() => onOpen(f)} aria-label={`${f.name} (${f.year})`}>
                <Poster path={f.posterPath} title={f.name} size={cols >= 5 ? "w185" : "w342"} />
              </button>
            )))}
          </div>
        )}
        {view === "list" && letters.map((g) => (
          <div key={g.letter || "all"}>
            {g.letter && <div className="letter" id={"L-" + g.letter}>{g.letter}</div>}
            {g.films.map((f) => (
              <button key={f.key} className="film-row" onClick={() => onOpen(f)}>
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
  const [more, setMore] = useState(false);
  const shown = films.filter(selTest(active)).length;
  const counts = useMemo(() => Object.fromEntries(groups.map(([g, , opts]) => {
    const base = films.filter(selTest(active, g));
    return [g, Object.fromEntries(opts.map(([k, , t]) => [k, base.filter(t).length]))];
  })), [films, groups, active]);
  const on = (g, k) => (sel[g] || []).includes(k);
  return (
    <Sheet title="Filter" onClose={onClose} tall
      left={active.length ? <button className="left" onClick={onReset}>Reset</button> : null}
      foot={<button className="btn btn-primary" onClick={onClose}>{shown ? `Show ${shown} film${shown === 1 ? "" : "s"}` : "No films match"}</button>}>
      {groups.map(([g, name, opts]) => {
        const cap = g === "label" && !more ? 10 : Infinity;
        const visible = opts.filter((o, i) => i < cap || on(g, o[0]));
        const picked = (sel[g] || []).filter((k) => opts.some((o) => o[0] === k)).length;
        return (
          <section key={g} className="fgroup">
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
              {opts.length > visible.length && <button className="chip fchip more" onClick={() => setMore(true)}>All {opts.length}</button>}
            </div>
            {g === "tag" && opts.length <= Object.keys(TAGS).length && <p className="muted fnote">Make your own tags from any film's page.</p>}
          </section>
        );
      })}
    </Sheet>
  );
}

// ─── FILM PAGE ──────────────────────────────────────────────────────────
function FilmPage({ film, films, allTags, backLabel, onBack, onOpen, onPerson, onUpdate, onLog, onUnlog, onRemove, onPicker, onAddTag, onRemoveTag, onEditCopy, onEditDetails }) {
  const [note, setNote] = useState(film.note);
  const [newTag, setNewTag] = useState(null);
  const [editTags, setEditTags] = useState(false);
  const [doomed, setDoomed] = useState(null);
  const ref = useRef(null);
  useEffect(() => { setNote(film.note); setNewTag(null); setEditTags(false); setDoomed(null); ref.current?.scrollTo(0, 0); }, [film.key]);
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
        setTimeout(() => { set(0, false); onBack(); }, 220);
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
  const more = film.directors.length ? films.filter((f) => f.key !== film.key && f.directors.includes(film.directors[0])) : [];
  const owned = useMemo(() => new Set(films.map((f) => f.tmdb)), [films]);
  const coll = film.collection && COLLECTIONS[film.collection];
  const collOwned = coll ? coll.parts.filter((p) => owned.has(p[0])).length : 0;
  const toggleTag = (t) => onUpdate(film.key, { tags: film.tags.includes(t) ? film.tags.filter((x) => x !== t) : [...film.tags, t] });

  return (
    <div className="film-page" ref={ref} role="dialog" aria-label={film.name}>
      <div className="film-inner">
        <div className="film-hero">
          {film.backdrop && <img src={img(film.backdrop, "w780")} alt="" />}
          <button className="back" onClick={onBack}><Icon d={I.back} size={20} sw={2.4} /><span>{backLabel}</span></button>
        </div>

        <div className="film-head">
          <button onClick={onPicker} aria-label="Change poster" disabled={!film.tmdb}>
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
            <button className="btn btn-outline" onClick={onPicker} disabled={!film.tmdb}>Change poster</button>
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
            <label className="section-label" htmlFor="notes">Notes</label>
            <textarea id="notes" className="notes" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== film.note && onUpdate(film.key, { note })}
              placeholder="Edition details, upgrade plans, who borrowed it" />
          </div>

          {more.length > 0 && (
            <section>
              <div className="stat-head" style={{ marginBottom: 10 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>More from {film.directors[0].split(" ").slice(-1)[0]}</h2>
                <span className="muted" style={{ fontSize: 13 }}>{more.length} more on your shelf</span>
              </div>
              <div className="shelf-row" style={{ margin: "0 -20px" }}>
                {more.sort((a, b) => b.yearNum - a.yearNum).map((f) => (
                  <button key={f.key} className="shelf-item" onClick={() => onOpen(f)}>
                    <Poster path={f.posterPath} title={f.name} size="w185" />
                    <span>{f.year}</span>
                  </button>
                ))}
              </div>
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

function PosterPicker({ film, onPick, onClose }) {
  const [posters, setPosters] = useState(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(32);
  useEffect(() => {
    let dead = false;
    tmdb(`/${film.tmdbType || "movie"}/${film.tmdb}/images`)
      .then((res) => {
        if (dead) return;
        const rank = (p) => (p.iso_639_1 === "en" ? 0 : p.iso_639_1 == null ? 1 : 2);
        setPosters((res.posters || []).slice().sort((a, b) => rank(a) - rank(b) || b.vote_average - a.vote_average || b.vote_count - a.vote_count));
      })
      .catch((e) => !dead && setError(e.message));
    return () => { dead = true; };
  }, [film.tmdb, film.tmdbType]);
  const badge = (p) => (p.iso_639_1 == null ? "No text" : p.iso_639_1 === "en" ? null : p.iso_639_1.toUpperCase());

  return (
    <Sheet title="Choose a poster" onClose={onClose} tall
      left={film.customPoster ? <button className="left" onClick={() => onPick(null)}>Use default</button> : null}>
      <div className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        {posters ? `${posters.length} posters on TMDB. English first, then textless.` : error ? "" : "Loading posters…"}
      </div>
      {error && <div className="empty">Couldn't load posters: {error}</div>}
      {posters && posters.length === 0 && <div className="empty">TMDB has no posters for this film yet.</div>}
      {posters && posters.length > 0 && (
        <div className="picker-grid">
          {posters.slice(0, shown).map((p) => {
            const on = p.file_path === film.posterPath;
            return (
              <button key={p.file_path} className={"picker-item" + (on ? " on" : "")} aria-pressed={on} aria-label="Use this poster" onClick={() => onPick(p.file_path)}>
                <Poster path={p.file_path} size="w185" />
                {badge(p) && <span className="picker-badge">{badge(p)}</span>}
                {on && <span className="picker-check"><Icon d={I.check} size={12} sw={3} /></span>}
              </button>
            );
          })}
        </div>
      )}
      {posters && shown < posters.length && <button className="btn btn-outline" onClick={() => setShown(shown + 32)}>Show more posters</button>}
    </Sheet>
  );
}

// ─── EDIT A COPY ────────────────────────────────────────────────────────
function CopySheet({ film, copy, labels, onSave, onClose }) {
  const isNew = !copy;
  const [c, setC] = useState(() => copy ? { ...copy, price: copy.price ?? "" } : { id: newId(), format: "", package: "Standard", label: "", region: "", purchased: "", price: "", note: "" });
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const clean = (x) => {
    const out = { ...x, id: x.id.startsWith("s") ? newId() : x.id, label: (x.label || "").trim(), note: (x.note || "").trim() };
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
        <div style={{ flex: 1 }}>
          <label className="field-label" htmlFor="copy-date">Bought on</label>
          <input id="copy-date" className="field" type="date" value={c.purchased || ""} onChange={(e) => set("purchased", e.target.value)} />
        </div>
        <div style={{ width: 120 }}>
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
        <div className="strip">
          <div><b>{films.length}</b><span>Films</span></div>
          <div><b>{s.avg.toFixed(1)}★</b><span>Average rating</span></div>
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

// ─── BACKUP ─────────────────────────────────────────────────────────────
function Backup({ D, films, onBuy }) {
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
    <div className="page" style={{ gap: 28 }}>
      <div className="page-head"><h1>Backup</h1></div>
      <section className="stat-section" style={{ gap: 0, marginTop: -14 }}>
        {row("Films", films.length)}
        {row("Added here", films.filter((f) => f.userAdded).length)}
        {row("Tagged", Object.values(D.userData).filter((u) => u.tags && u.tags.length).length)}
        {row("Custom posters", Object.values(D.userData).filter((u) => u.poster).length)}
        {row("Films with copy details", Object.values(D.userData).filter((u) => u.copies && u.copies.length).length)}
        {row("Watches logged here", Object.keys(D.watchLog).length)}
      </section>

      <section className="stat-section">
        <div className="btn-row" style={{ flexDirection: "column" }}>
          <button className="btn btn-primary" style={{ height: 46 }} onClick={doExport}>Export backup</button>
          <button className="btn btn-outline" style={{ height: 46 }} onClick={() => fileRef.current.click()}>Restore from backup</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={doImport} style={{ display: "none" }} />
        <span className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{msg || "Tags, notes, poster choices, films added here, the want list and watch log live only on this device. Export now and then, and always before clearing Safari."}</span>
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
const TABS = [["home", "Home", I.home], ["library", "Library", I.library], ["stats", "Stats", I.stats], ["backup", "Backup", I.backup]];
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
  const recipes = useMemo(() => buildRecipes(films, D.customTags), [films, D.customTags]);
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
  useBodyLock(!!top || !!adding || !!picking || showFilters || !!copyEdit || !!detailsFor);

  const openFilm = (f) => setStack((s) => (s[s.length - 1] === f.key ? s : [...s, f.key]));
  const back = () => setStack((s) => s.slice(0, -1));
  const goTab = (t) => { setStack([]); if (t === tab) window.scrollTo({ top: 0, behavior: "smooth" }); else { setTab(t); window.scrollTo(0, 0); } };
  const toLibrary = (filter) => { setExtra(filter); setStack([]); setTab("library"); window.scrollTo(0, 0); };
  const onPerson = (name) => toLibrary({ label: name, test: (f) => f.directors.includes(name) || f.dop.includes(name) || f.music.includes(name) || f.cast.includes(name) });
  const backLabel = stack.length > 1 ? (byKey.get(stack[stack.length - 2])?.name || "Back") : TAB_NAMES[tab];

  return (
    <div className="app">
      <main hidden={tab !== "home"}>
        <Home films={films} defs={defs} recipes={recipes} filters={filters} home={home} setHome={setHome} active={tab === "home" && !top}
          onOpen={openFilm} onSeeAll={(s) => toLibrary({ label: s.title, test: s.test })}
          onSearch={() => { toLibrary(null); setSearchFocus((n) => n + 1); }}
          onFilters={(x) => (x === "reset" ? setFilters({}) : setShowFilters(true))} />
      </main>
      {tab === "library" && <main><Library films={films} customTags={D.customTags} extra={extra} setExtra={setExtra} onOpen={openFilm} onAdd={() => setAdding({})} searchFocus={searchFocus} onFocused={() => setSearchFocus(0)} /></main>}
      {tab === "stats" && <main><Stats films={films} onPerson={onPerson} onLabel={(l) => toLibrary({ label: l, test: (f) => f.copies.some((c) => c.label === l) })} /></main>}
      {tab === "backup" && <main><Backup D={D} films={films} onBuy={(w) => setAdding({ name: w.film, year: w.year, label: w.label })} /></main>}

      {top && (
        <FilmPage key="film" film={top} films={films} allTags={allTags} onAddTag={D.addTag} onRemoveTag={D.removeTag}
          onEditCopy={(c) => setCopyEdit({ key: top.key, copy: c })} onEditDetails={() => setDetailsFor(top.key)} backLabel={backLabel} onBack={back} onOpen={openFilm} onPerson={onPerson}
          onUpdate={D.updateFilm} onLog={D.logWatch} onUnlog={D.unlogWatch} onRemove={D.removeFilm} onPicker={() => setPicking(top.key)} />
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

      {copyEdit && byKey.get(copyEdit.key) && (
        <CopySheet film={byKey.get(copyEdit.key)} copy={copyEdit.copy} labels={labels} onClose={() => setCopyEdit(null)}
          onSave={(copies) => { D.updateFilm(copyEdit.key, { copies }); setCopyEdit(null); }} />
      )}
      {detailsFor && byKey.get(detailsFor) && <DetailsSheet film={byKey.get(detailsFor)} onUpdate={D.updateFilm} onClose={() => setDetailsFor(null)} />}
      {showFilters && <FilterSheet films={films} defs={defs} filters={filters} setFilters={setFilters} onClose={() => setShowFilters(false)} />}
      {picking && byKey.get(picking) && (
        <PosterPicker film={byKey.get(picking)} onClose={() => setPicking(null)}
          onPick={(p) => { D.updateFilm(picking, { poster: p }); setPicking(null); }} />
      )}
      {adding && <AddSheet prefill={adding} existing={films} onAdd={(f) => { D.addFilm({ ...f, addedAt: todayISO() }); setAdding(null); }} onClose={() => setAdding(null)} />}
    </div>
  );
}
