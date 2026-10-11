import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import SEED_COLLECTION from "./collection.json";
import COLLECTIONS from "./collections.json";
import META from "./meta.json";
import { SEED_WANTLIST } from "./wantlist.js";
import {
  store, readJSON, fkey, img, tmdb, shapeTmdbMovie, todayISO, thisYear, fmtDate, runtimeLabel, stars,
  sortKey, letterOf, peopleLabel, editionBadges, hashStr, rng,
} from "./lib.js";
import { TAGS, FILTERS, filterTest, activeFilterLabels, buildRecipes, dealShelves } from "./shelves.js";
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
  return {
    userData, added, want, watchLog,
    updateFilm: (k, u) => setUserData((d) => ({ ...d, [k]: { ...(d[k] || {}), ...u } })),
    addFilm: (f) => setAdded((a) => [...a, { ...f, userAdded: true }]),
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
    },
    exportPayload: () => ({ userData, added, want, watchLog }),
  };
}

function deriveFilm(f, userData, watchLog) {
  const key = fkey(f);
  const u = userData[key] || {};
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
    badges: editionBadges(f.edition || ""),
    views, lastWatched,
    yearNum: parseInt(f.year) || 0,
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

function Home({ films, recipes, filters, home, setHome, onOpen, onSeeAll, onSearch, onFilters, active }) {
  const eligible = useMemo(() => films.filter(filterTest(filters)), [films, filters]);
  const pick = pickFrom(eligible, home.date, home.pick);
  const shelves = useMemo(() => dealShelves(recipes, hashStr(home.date) + home.seed * 104729), [recipes, home.date, home.seed]);
  const labels = activeFilterLabels(filters);
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
            <div className="hero-line">
              <span>Tonight · {eligible.length === 1 ? "1 film fits" : eligible.length + " films fit"}</span>
              <button className="filter-btn" onClick={onFilters}>{filterLabel}<Icon d={I.down} size={11} sw={2.8} /></button>
            </div>
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

function FilterSheet({ films, filters, setFilters, onClose }) {
  const matching = films.filter(filterTest(filters)).length;
  const groups = useMemo(() => FILTERS.map(([key, label, opts]) => {
    const base = films.filter(filterTest(filters, key));
    return { key, label, opts: opts.map(([o, l, test]) => ({ o, l, n: base.filter(test).length })) };
  }), [films, filters]);
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
const CHIPS = [
  ["all", "All", () => true],
  ["five", "5 stars", (f) => f.rating === 5],
  ["editions", "Special editions", (f) => !!f.edition],
  ["4k", "4K", (f) => f.badges.includes("4K")],
  ["u120", "Under 2 hours", (f) => f.runtime && f.runtime < 120],
  ["never", "Never logged", (f) => !f.lastWatched],
  ["added", "Added here", (f) => !!f.userAdded],
  ...Object.entries(TAGS).map(([k, l]) => ["tag:" + k, l, (f) => f.tags.includes(k)]),
];
const SORTS = {
  az: ["Title A–Z", (a, b) => a.sortKey.localeCompare(b.sortKey)],
  newest: ["Newest", (a, b) => b.yearNum - a.yearNum || a.sortKey.localeCompare(b.sortKey)],
  oldest: ["Oldest", (a, b) => a.yearNum - b.yearNum || a.sortKey.localeCompare(b.sortKey)],
  rating: ["Top rated", (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.sortKey.localeCompare(b.sortKey)],
  dusty: ["Longest unwatched", (a, b) => (a.lastWatched || "").localeCompare(b.lastWatched || "")],
  long: ["Longest runtime", (a, b) => (b.runtime || 0) - (a.runtime || 0)],
};

function Library({ films, extra, setExtra, onOpen, onAdd, searchFocus, onFocused }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("all");
  const [sort, setSort] = useState(() => store.get("shelf-sort") || "az");
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
  const inputRef = useRef(null);
  useEffect(() => { if (searchFocus) { inputRef.current?.focus(); onFocused(); } }, [searchFocus]);

  const fives = films.filter((f) => f.rating === 5).length;
  const never = films.filter((f) => !f.lastWatched).length;
  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    const chipTest = CHIPS.find((c) => c[0] === chip)[2];
    return films
      .filter((f) => chipTest(f) && (!extra || extra.test(f)))
      .filter((f) => !query || f.name.toLowerCase().includes(query) || f.year === query
        || f.directors.some((d) => d.toLowerCase().includes(query)) || f.cast.some((c) => c.toLowerCase().includes(query)))
      .sort(SORTS[sort][1]);
  }, [films, chip, extra, query, sort]);
  const grouped = sort === "az";
  const groups = useMemo(() => {
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
        {extra && (
          <div className="chips">
            <button className="chip on chip-x" onClick={() => setExtra(null)} aria-label={"Remove filter " + extra.label}>
              {extra.label}<Icon d={I.close} size={12} sw={2.6} />
            </button>
          </div>
        )}
        <div className="chips">
          {CHIPS.map(([k, l]) => (
            <button key={k} className={"chip" + (chip === k ? " on" : "")} aria-pressed={chip === k} onClick={() => setChip(k)}>{l}</button>
          ))}
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
            {SORTS[sort][0]}<Icon d={I.down} size={12} sw={2.6} />
            <select value={sort} onChange={(e) => { setSort(e.target.value); store.set("shelf-sort", e.target.value); }} aria-label="Sort by">
              {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        {list.length === 0 && (
          <div className="empty">
            No films match{query ? ` "${q.trim()}"` : ""}.
            <div style={{ marginTop: 12, display: "flex", gap: 18, justifyContent: "center" }}>
              {(q || chip !== "all" || extra) && <button className="link" onClick={() => { setQ(""); setChip("all"); setExtra(null); }}>Clear filters</button>}
              <button className="link" onClick={onAdd}>Add a film</button>
            </div>
          </div>
        )}
        {view === "wall" && list.length > 0 && (
          <div className="wall" style={{ "--cols": cols }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
            {groups.flatMap((g) => g.films.map((f, i) => (
              <button key={f.key} id={grouped && i === 0 ? "L-" + g.letter : undefined} onClick={() => onOpen(f)} aria-label={`${f.name} (${f.year})`}>
                <Poster path={f.posterPath} title={f.name} size={cols >= 5 ? "w185" : "w342"} />
              </button>
            )))}
          </div>
        )}
        {view === "list" && groups.map((g) => (
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

      {grouped && list.length > 40 && (
        <nav className="rail" aria-label="Jump to letter">
          {groups.map((g) => <button key={g.letter} onClick={() => jump(g.letter)} aria-label={"Jump to " + g.letter}>{g.letter}</button>)}
        </nav>
      )}
    </>
  );
}

// ─── FILM PAGE ──────────────────────────────────────────────────────────
function FilmPage({ film, films, backLabel, onBack, onOpen, onPerson, onUpdate, onLog, onUnlog, onRemove, onPicker }) {
  const [note, setNote] = useState(film.note);
  const ref = useRef(null);
  useEffect(() => { setNote(film.note); ref.current?.scrollTo(0, 0); }, [film.key]);

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

          <dl className="dl">
            {film.edition && <div><dt>Edition</dt><dd>{film.edition}</dd></div>}
            <div><dt>Last watched</dt><dd className="tnum">{film.lastWatched ? fmtDate(film.lastWatched) : "Never logged"}</dd></div>
            {film.views.length > 1 && <div><dt>Watched</dt><dd className="tnum">{film.views.length} times</dd></div>}
            {film.dop[0] && <div><dt>Cinematography</dt><dd><button onClick={() => onPerson(film.dop[0])}>{film.dop[0]}</button></dd></div>}
            {film.music.length > 0 && <div><dt>Music</dt><dd><button onClick={() => onPerson(film.music[0])}>{peopleLabel(film.music)}</button></dd></div>}
            {film.cast.length > 0 && <div><dt>Starring</dt><dd>{film.cast.join(", ")}</dd></div>}
            {coll && coll.parts.length > 1 && <div><dt>Series</dt><dd>{coll.name.replace(/ Collection$/, "")} · {collOwned} of {coll.parts.length} owned</dd></div>}
          </dl>

          <div>
            <div className="section-label">Tags</div>
            <div className="tag-row">
              {Object.entries(TAGS).map(([k, l]) => (
                <button key={k} className={"chip" + (film.tags.includes(k) ? " on" : "")} aria-pressed={film.tags.includes(k)} onClick={() => toggleTag(k)}>{l}</button>
              ))}
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

          {film.userAdded && (
            <button className="danger" onClick={() => { onRemove(film.key); onBack(); }}>Remove from collection</button>
          )}
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
      const d = await tmdb(`/movie/${chosen.id}`, { append_to_response: "credits,images", include_image_language: "en,null" });
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

function Stats({ films, onPerson }) {
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
      editions: films.filter((f) => f.edition).length,
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
  const byKey = useMemo(() => new Map(films.map((f) => [f.key, f])), [films]);
  const recipes = useMemo(() => buildRecipes(films), [films]);

  // Films added by hand in the old app have no TMDB data yet: look them up once.
  const tried = useRef(new Set());
  useEffect(() => {
    D.added.filter((f) => !f.tmdb && !tried.current.has(fkey(f))).forEach(async (f) => {
      tried.current.add(fkey(f));
      try {
        const res = await tmdb("/search/movie", { query: f.name, year: f.year });
        const hit = (res.results || []).find((r) => (r.release_date || "").startsWith(f.year)) || res.results?.[0];
        if (!hit) return;
        const d = await tmdb(`/movie/${hit.id}`, { append_to_response: "credits,images", include_image_language: "en,null" });
        D.patchAdded(fkey(f), shapeTmdbMovie(d));
      } catch {}
    });
  }, [D.added]);

  const top = stack.length ? byKey.get(stack[stack.length - 1]) : null;
  useBodyLock(!!top || !!adding || !!picking || showFilters);

  const openFilm = (f) => setStack((s) => (s[s.length - 1] === f.key ? s : [...s, f.key]));
  const back = () => setStack((s) => s.slice(0, -1));
  const goTab = (t) => { setStack([]); if (t === tab) window.scrollTo({ top: 0, behavior: "smooth" }); else { setTab(t); window.scrollTo(0, 0); } };
  const toLibrary = (filter) => { setExtra(filter); setStack([]); setTab("library"); window.scrollTo(0, 0); };
  const onPerson = (name) => toLibrary({ label: name, test: (f) => f.directors.includes(name) || f.dop.includes(name) || f.music.includes(name) || f.cast.includes(name) });
  const backLabel = stack.length > 1 ? (byKey.get(stack[stack.length - 2])?.name || "Back") : TAB_NAMES[tab];

  return (
    <div className="app">
      <main hidden={tab !== "home"}>
        <Home films={films} recipes={recipes} filters={filters} home={home} setHome={setHome} active={tab === "home" && !top}
          onOpen={openFilm} onSeeAll={(s) => toLibrary({ label: s.title, test: s.test })}
          onSearch={() => { toLibrary(null); setSearchFocus((n) => n + 1); }}
          onFilters={(x) => (x === "reset" ? setFilters({}) : setShowFilters(true))} />
      </main>
      {tab === "library" && <main><Library films={films} extra={extra} setExtra={setExtra} onOpen={openFilm} onAdd={() => setAdding({})} searchFocus={searchFocus} onFocused={() => setSearchFocus(0)} /></main>}
      {tab === "stats" && <main><Stats films={films} onPerson={onPerson} /></main>}
      {tab === "backup" && <main><Backup D={D} films={films} onBuy={(w) => setAdding({ name: w.film, year: w.year, label: w.label })} /></main>}

      {top && (
        <FilmPage key="film" film={top} films={films} backLabel={backLabel} onBack={back} onOpen={openFilm} onPerson={onPerson}
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

      {showFilters && <FilterSheet films={films} filters={filters} setFilters={setFilters} onClose={() => setShowFilters(false)} />}
      {picking && byKey.get(picking) && (
        <PosterPicker film={byKey.get(picking)} onClose={() => setPicking(null)}
          onPick={(p) => { D.updateFilm(picking, { poster: p }); setPicking(null); }} />
      )}
      {adding && <AddSheet prefill={adding} existing={films} onAdd={(f) => { D.addFilm(f); setAdding(null); }} onClose={() => setAdding(null)} />}
    </div>
  );
}
