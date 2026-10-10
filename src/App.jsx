import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import SEED_COLLECTION from "./collection.json";
import "./styles.css";

// ════════════════════════════════════════════════════════════════════════
//  THE SHELF — j_ck's physical collection
//  Neutral, system-native chrome; the posters carry the color.
//  Poster art and metadata from TMDB (proxied through /api/tmdb).
// ════════════════════════════════════════════════════════════════════════

const SEED_WANTLIST = [
  {"film":"Innerspace","year":"1987","label":"Arrow Limited Edition 4K","note":"New 4K from 35mm negative, Dante-approved, Dolby Vision. The headliner.","kind":"upgrade"},
  {"film":"Point Blank","year":"1967","label":"Criterion 4K","note":"Boorman-supervised restoration. Upgrade over your current copy.","kind":"upgrade"},
  {"film":"Top Gun","year":"1986","label":"40th Anniversary 4K Steelbook","note":"Clean upgrade, premium packaging.","kind":"upgrade"},
  {"film":"Bullet in the Head","year":"1990","label":"Arrow Limited Edition 4K","note":"The missing John Woo. Pairs with your Killer + Hard Boiled.","kind":"new"},
  {"film":"Bringing Out the Dead","year":"1999","label":"4K UHD","note":"The missing Scorsese. Schrader script, Nic Cage.","kind":"new"},
  {"film":"Audition","year":"1999","label":"Arrow Limited Edition 4K","note":"Miike. If you own Oldboy, you should own this. 160-page book.","kind":"new"},
  {"film":"The Elephant Man","year":"1980","label":"Criterion 4K","note":"Lynch. New 4K restoration with memoir readings.","kind":"new"},
  {"film":"Falling Down","year":"1993","label":"Arrow Limited Edition 4K","note":"Schumacher, Douglas, Duvall. In your wheelhouse.","kind":"new"},
  {"film":"Lawrence of Arabia","year":"1962","label":"4K UHD","note":"5\u2605 and you don't own it. The most cinematic film ever made.","kind":"gap"},
  {"film":"The Wizard of Oz","year":"1939","label":"Warner 4K","note":"5\u2605. Reference-disc Technicolor restoration.","kind":"gap"},
  {"film":"Stop Making Sense","year":"1984","label":"A24 4K","note":"5\u2605. Your highest-rated music doc, not owned.","kind":"gap"},
  {"film":"Incendies","year":"2010","label":"Criterion","note":"The one Villeneuve you don't own. 5\u2605.","kind":"gap"}
]
;

const TAGS = {
  upgrade: { label: "Upgrade", color: "#ff9f0a" },
  comfort: { label: "Comfort", color: "#ff375f" },
  hidden:  { label: "Gem",     color: "#5e5ce6" },
  rewatch: { label: "Rewatch", color: "#30b0c7" },
  sell:    { label: "Sell",    color: "#8e8e93" },
};

const TODAY = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
const decadeOf = (y) => { const n = parseInt(y); return isNaN(n) ? null : Math.floor(n / 10) * 10; };
const yearsSince = (d) => (d ? (new Date(TODAY) - new Date(d)) / (1000 * 60 * 60 * 24 * 365) : null);
const fkey = (f) => f.name + "|" + f.year;
const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const ratingText = (r) => (r == null ? "Unrated" : "★ " + (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)));

// ─── PERSISTENCE ────────────────────────────────────────────────────────
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); } catch {} },
};
const readJSON = (key, fallback) => { const v = store.get(key); if (!v) return fallback; try { return JSON.parse(v); } catch { return fallback; } };

function useData() {
  const [userData, setUserData] = useState(() => readJSON("shelf-userdata", {}));
  const [added, setAdded] = useState(() => readJSON("shelf-added", []));
  const [want, setWant] = useState(() => readJSON("shelf-want", SEED_WANTLIST.map((w) => ({ ...w, bought: false }))));
  const [watchLog, setWatchLog] = useState(() => readJSON("shelf-watchlog", {}));

  const save = (key, setter) => (next) => { setter(next); store.set(key, JSON.stringify(next)); };
  const saveUser = save("shelf-userdata", setUserData);
  const saveAdded = save("shelf-added", setAdded);
  const saveWant = save("shelf-want", setWant);
  const saveLog = save("shelf-watchlog", setWatchLog);

  return {
    userData, added, want, watchLog,
    updateFilm: (k, u) => saveUser({ ...userData, [k]: { ...(userData[k] || {}), ...u } }),
    addFilm: (f) => saveAdded([...added, { ...f, userAdded: true }]),
    removeFilm: (k) => saveAdded(added.filter((f) => fkey(f) !== k)),
    logWatch: (k) => saveLog({ ...watchLog, [k]: TODAY }),
    setWantList: saveWant,
    importAll: (p) => {
      if (p.userData) saveUser(p.userData);
      if (p.added) saveAdded(p.added);
      if (p.want) saveWant(p.want);
      if (p.watchLog) saveLog(p.watchLog);
    },
    exportPayload: () => ({ userData, added, want, watchLog }),
  };
}

// ─── TMDB ───────────────────────────────────────────────────────────────
const IMG = (path, size = "w342") => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

async function tmdb(path, params = {}) {
  const r = await fetch("/api/tmdb?" + new URLSearchParams({ path, ...params }));
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || body.status_message || "TMDB request failed (" + r.status + ")");
  return body;
}

// Cache of resolved TMDB ids and default posters, keyed by film. Re-derivable,
// so it lives in its own storage key and stays out of the backup file.
const meta = (() => {
  let cache = readJSON("shelf-tmdbmeta", {});
  const subs = new Set();
  const inflight = new Map();
  const queue = [];
  let active = 0;
  let saveTimer = null;

  const emit = () => {
    subs.forEach((fn) => fn());
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set("shelf-tmdbmeta", JSON.stringify(cache)), 400);
  };

  async function resolve(film) {
    const type = film.tmdbType || "movie";
    if (film.tmdb) {
      const m = await tmdb(`/${type}/${film.tmdb}`);
      return { id: film.tmdb, type, poster: m.poster_path || null };
    }
    // Films added by hand have no id yet: search by title, prefer an exact year.
    const res = await tmdb("/search/movie", { query: film.name });
    const y = parseInt(film.year);
    const year = (r) => parseInt((r.release_date || "").slice(0, 4));
    const hit = res.results?.find((r) => year(r) === y) || res.results?.find((r) => Math.abs(year(r) - y) <= 1);
    return hit ? { id: hit.id, type: "movie", poster: hit.poster_path || null, guessed: true } : { missing: true };
  }

  function pump() {
    while (active < 4 && queue.length) {
      const film = queue.shift();
      const k = fkey(film);
      active++;
      const p = resolve(film)
        .then((v) => { cache = { ...cache, [k]: v }; emit(); })
        .catch(() => {})
        .finally(() => { active--; inflight.delete(k); pump(); });
      inflight.set(k, p);
    }
  }

  return {
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    snapshot: () => cache,
    request(film) {
      const k = fkey(film);
      if (film.poster || cache[k] || inflight.has(k) || queue.some((f) => fkey(f) === k)) return;
      queue.push(film);
      pump();
    },
    forget(film) { const { [fkey(film)]: _, ...rest } = cache; cache = rest; emit(); },
  };
})();

const useMeta = () => useSyncExternalStore(meta.subscribe, meta.snapshot, meta.snapshot);

function filmArt(film, userData, cache) {
  const k = fkey(film);
  const m = cache[k] || {};
  return {
    id: film.tmdb || m.id || null,
    type: film.tmdbType || m.type || "movie",
    guessed: !film.tmdb && !!m.guessed,
    poster: (userData[k] || {}).poster || film.poster || m.poster || null,
  };
}

// ─── ICONS (SF Symbols-ish line icons) ──────────────────────────────────
const Icon = ({ d, size = 24, fill = "none", sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const I = {
  tonight: <><path d="M3 7h3.5c2.5 0 4 1.3 5.5 5s3 5 5.5 5H21" /><path d="M3 17h3.5c1.6 0 2.8-.6 3.8-1.8" /><path d="M13.7 8.8C14.7 7.6 15.9 7 17.5 7H21" /><path d="m18.5 4.5 2.5 2.5-2.5 2.5" /><path d="m18.5 14.5 2.5 2.5-2.5 2.5" /></>,
  shelf: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  want: <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2-6.5 4.2v-16a1 1 0 0 1 1-1Z" />,
  data: <><path d="M4 13.5 6.2 5.6A1.5 1.5 0 0 1 7.6 4.5h8.8a1.5 1.5 0 0 1 1.4 1.1L20 13.5" /><path d="M4 13.5h4.5l1.2 2.5h4.6l1.2-2.5H20v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <path d="M7 7l10 10M17 7 7 17" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r=".8" fill="currentColor" /><circle cx="4.5" cy="12" r=".8" fill="currentColor" /><circle cx="4.5" cy="18" r=".8" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
};
const Chevron = () => <span className="chev"><Icon d={I.chevron} size={14} sw={2.4} /></span>;

// ─── SHARED BITS ────────────────────────────────────────────────────────
function Poster({ film, path, size = "w342", className = "", lazy = true, request = true }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [path]);
  useEffect(() => {
    if (path || !request || !film) return;
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { meta.request(film); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { meta.request(film); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [path, film && fkey(film), request]);
  const src = IMG(path, size);
  return (
    <div ref={ref} className={"poster " + className}>
      {src && !failed
        ? <img src={src} alt="" loading={lazy ? "lazy" : "eager"} decoding="async" onError={() => setFailed(true)} />
        : <div className="poster-empty">{film?.name}</div>}
    </div>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

const Switch = ({ on, onChange, label }) => (
  <button className={"switch" + (on ? " on" : "")} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
);

function Section({ header, footer, children }) {
  return (
    <div className="section">
      {header && <div className="section-header">{header}</div>}
      <div className="group">{children}</div>
      {footer && <div className="section-footer">{footer}</div>}
    </div>
  );
}

function Sheet({ title, onClose, children, action }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-bar">
          {action || <span style={{ width: 30 }} />}
          <h3>{title}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close"><Icon d={I.close} size={14} sw={2.6} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── FILM DETAIL ────────────────────────────────────────────────────────
function FilmSheet({ film, userData, cache, onClose, onUpdate, onRemove, onLog }) {
  const k = fkey(film);
  const u = userData[k] || {};
  const tags = u.tags || [];
  const art = filmArt(film, userData, cache);
  const [note, setNote] = useState(u.note || "");
  const [picking, setPicking] = useState(false);
  const [logged, setLogged] = useState(false);
  useEffect(() => { meta.request(film); }, [k]);

  const toggle = (t) => onUpdate(k, { tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });

  if (picking) {
    return <PosterPicker film={film} art={art} current={art.poster} custom={!!u.poster}
      onBack={() => setPicking(false)} onClose={onClose}
      onPick={(p) => { onUpdate(k, { poster: p }); setPicking(false); }} />;
  }

  return (
    <Sheet title="" onClose={onClose}>
      <div className="film-head">
        <button className="poster-btn" onClick={() => art.id && setPicking(true)} aria-label="Change poster">
          <Poster film={film} path={art.poster} className="lifted" lazy={false} request={false} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h2>{film.name}</h2>
          <div className="meta">{film.year} · {ratingText(film.rating)}</div>
        </div>
      </div>

      <Section footer={art.guessed ? "Poster matched by title search. If it's the wrong film, pick another." : null}>
        <button className="row" onClick={() => { onLog(k); setLogged(true); }}>
          <span className="row-main row-tint">{logged ? "Marked as watched today" : "Mark as watched today"}</span>
        </button>
        <button className="row" disabled={!art.id} onClick={() => setPicking(true)}>
          <span className={"row-main " + (art.id ? "row-tint" : "")} style={art.id ? null : { color: "var(--label-3)" }}>Change poster</span>
          {u.poster && <span className="row-value">Custom</span>}
        </button>
      </Section>

      <Section>
        {film.edition && (
          <div className="row"><span className="row-main">Edition</span><span className="row-value" style={{ maxWidth: "62%", textAlign: "right", whiteSpace: "normal", padding: "11px 0" }}>{film.edition}</span></div>
        )}
        <div className="row">
          <span className="row-main">Last watched</span>
          <span className="row-value">{film.lastWatched ? fmtDate(film.lastWatched) : film.userAdded ? "Not yet" : "Never logged"}</span>
        </div>
      </Section>

      <div className="section">
        <div className="section-header">Tags</div>
        <div className="tag-grid">
          {Object.entries(TAGS).map(([key, def]) => (
            <button key={key} className={"tag" + (tags.includes(key) ? " on" : "")} aria-pressed={tags.includes(key)} onClick={() => toggle(key)}>
              <span className="dot" style={{ background: def.color }} />{def.label}
            </button>
          ))}
        </div>
      </div>

      <Section header="Notes">
        <div className="row">
          <textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => onUpdate(k, { note })}
            placeholder="Edition details, upgrade plans, who borrowed it" />
        </div>
      </Section>

      {film.userAdded && (
        <Section>
          <button className="row" onClick={() => { onRemove(k); onClose(); }}><span className="row-main row-danger">Remove from collection</span></button>
        </Section>
      )}
    </Sheet>
  );
}

// ─── POSTER PICKER ──────────────────────────────────────────────────────
const LANG = { null: "No text", en: null };
function PosterPicker({ film, art, current, custom, onPick, onBack, onClose }) {
  const [posters, setPosters] = useState(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(30);

  useEffect(() => {
    let dead = false;
    tmdb(`/${art.type}/${art.id}/images`)
      .then((res) => {
        if (dead) return;
        const rank = (p) => (p.iso_639_1 === "en" ? 0 : p.iso_639_1 == null ? 1 : 2);
        const list = (res.posters || []).slice().sort((a, b) => rank(a) - rank(b) || b.vote_average - a.vote_average || b.vote_count - a.vote_count);
        setPosters(list);
      })
      .catch((e) => !dead && setError(e.message));
    return () => { dead = true; };
  }, [art.id, art.type]);

  const badge = (p) => (p.iso_639_1 in LANG ? LANG[p.iso_639_1] : p.iso_639_1?.toUpperCase());

  return (
    <Sheet title="Choose poster" onClose={onClose}
      action={<button className="btn-text" onClick={onBack}>Back</button>}>
      <div className="section-header" style={{ padding: "0 0 12px" }}>
        {film.name} · {posters ? posters.length + " posters on TMDB" : "Loading posters"}
      </div>
      {error && <div className="empty">Couldn't load posters. {error}</div>}
      {posters && posters.length === 0 && <div className="empty">TMDB has no posters for this film yet.</div>}
      {posters && posters.length > 0 && (
        <>
          <div className="picker-grid">
            {posters.slice(0, shown).map((p) => {
              const on = p.file_path === current;
              return (
                <button key={p.file_path} className={"picker-item" + (on ? " on" : "")} aria-pressed={on} onClick={() => onPick(p.file_path)}>
                  <Poster path={p.file_path} size="w185" request={false} />
                  {badge(p) && <span className="picker-badge">{badge(p)}</span>}
                  {on && <span className="picker-check"><Icon d={I.check} size={14} sw={3} /></span>}
                </button>
              );
            })}
          </div>
          {shown < posters.length && (
            <button className="btn-gray" style={{ marginTop: 16 }} onClick={() => setShown(shown + 30)}>Show more posters</button>
          )}
        </>
      )}
      {custom && (
        <button className="btn-gray" style={{ marginTop: 12 }} onClick={() => onPick(null)}>Use default poster</button>
      )}
    </Sheet>
  );
}

// ─── ADD FILM ───────────────────────────────────────────────────────────
function AddSheet({ onClose, onAdd, existing, prefill }) {
  const [name, setName] = useState(prefill?.name || "");
  const [year, setYear] = useState(prefill?.year || "");
  const [rating, setRating] = useState("");
  const [edition, setEdition] = useState(prefill?.label || "");
  const [err, setErr] = useState("");

  const submit = () => {
    if (!name.trim()) return setErr("Enter a title.");
    if (!/^\d{4}$/.test(year.trim())) return setErr("Enter a four-digit release year.");
    if (existing.has(name.trim() + "|" + year.trim())) return setErr("This film is already on your shelf.");
    onAdd({ name: name.trim(), year: year.trim(), rating: rating === "" ? null : parseFloat(rating), edition: edition.trim(), lastWatched: null });
    onClose();
  };

  return (
    <Sheet title="Add film" onClose={onClose} action={<button className="btn-text" onClick={onClose}>Cancel</button>}>
      <Section footer={err || "The poster is matched automatically by title and year."}>
        <div className="row"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Title" autoFocus /></div>
        <div className="row"><input className="field" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" inputMode="numeric" /></div>
        <div className="row"><input className="field" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="Edition, e.g. Criterion 4K" /></div>
        <div className="row">
          <span className="row-main">Rating</span>
          <select value={rating} onChange={(e) => setRating(e.target.value)} style={{ border: 0, background: "none", color: "var(--label-2)", fontSize: 17, textAlign: "right" }}>
            <option value="">None</option>
            {[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((r) => <option key={r} value={r}>{r} stars</option>)}
          </select>
        </div>
      </Section>
      <button className="btn-filled" onClick={submit}>Add to shelf</button>
    </Sheet>
  );
}

// ─── TONIGHT ────────────────────────────────────────────────────────────
function Tonight({ collection, userData, cache, onOpen }) {
  const [mood, setMood] = useState("any");
  const [minR, setMinR] = useState("any");
  const [stale, setStale] = useState(false);
  const [pick, setPick] = useState(null);
  const [rolling, setRolling] = useState(false);

  const tagged = (f, t) => ((userData[fkey(f)] || {}).tags || []).includes(t);
  const moods = {
    any: () => true,
    comfort: (f) => tagged(f, "comfort") || (f.rating != null && f.rating >= 4.5),
    classic: (f) => parseInt(f.year) < 1980,
    modern: (f) => parseInt(f.year) >= 2010,
    forgotten: (f) => !f.lastWatched || tagged(f, "rewatch"),
  };
  const eligible = useMemo(() => collection.filter((f) => {
    if (!moods[mood](f)) return false;
    if (minR !== "any" && !(f.rating != null && f.rating >= parseFloat(minR))) return false;
    if (stale && f.lastWatched && yearsSince(f.lastWatched) <= 1) return false;
    return !tagged(f, "sell");
  }), [mood, minR, stale, collection, userData]);

  const roll = () => {
    if (!eligible.length) return;
    const final = eligible[Math.floor(Math.random() * eligible.length)];
    meta.request(final);
    setRolling(true);
    let i = 0;
    const iv = setInterval(() => {
      setPick(eligible[Math.floor(Math.random() * eligible.length)]);
      if (++i > 9) { clearInterval(iv); setPick(final); setRolling(false); }
    }, 70);
  };

  const art = pick ? filmArt(pick, userData, cache) : null;

  return (
    <div className="page">
      {pick ? (
        <div className={"showing" + (rolling ? " rolling" : "")}>
          <button className="poster-btn" onClick={() => !rolling && onOpen(pick)} aria-label={"Open " + pick.name}>
            <Poster film={pick} path={rolling ? null : art.poster} size="w500" className="lifted" lazy={false} request={false} />
          </button>
          <h2>{pick.name}</h2>
          <div className="meta">{pick.year} · {ratingText(pick.rating)}</div>
          {pick.edition && <div className="edition">{pick.edition}</div>}
        </div>
      ) : (
        <div className="empty" style={{ paddingTop: 24 }}>Set a mood, then let the shelf decide.</div>
      )}

      <div style={{ margin: "24px 0 28px" }}>
        <button className="btn-filled" disabled={!eligible.length || rolling} onClick={roll}>
          {pick ? "Pick another" : "Pick a film"}
        </button>
        <div className="section-footer" style={{ textAlign: "center" }}>
          {eligible.length ? `Choosing from ${eligible.length} films` : "Nothing matches. Loosen a filter."}
        </div>
      </div>

      <div className="section">
        <div className="section-header">Mood</div>
        <Segmented label="Mood" value={mood} onChange={setMood}
          options={[["any", "Any"], ["comfort", "Comfort"], ["classic", "Classic"], ["modern", "Modern"], ["forgotten", "Forgotten"]]} />
      </div>
      <div className="section">
        <div className="section-header">Minimum rating</div>
        <Segmented label="Minimum rating" value={minR} onChange={setMinR} options={[["any", "Any"], ["4", "4+"], ["4.5", "4.5+"]]} />
      </div>
      <Section>
        <div className="row">
          <span className="row-main">Skip films seen this year</span>
          <Switch on={stale} onChange={setStale} label="Skip films seen in the last year" />
        </div>
      </Section>
    </div>
  );
}

// ─── SHELF ──────────────────────────────────────────────────────────────
function Browse({ collection, userData, cache, onOpen, onAdd }) {
  const [q, setQ] = useState("");
  const [dec, setDec] = useState("all");
  const [minR, setMinR] = useState("all");
  const [tag, setTag] = useState("all");
  const [edOnly, setEdOnly] = useState(false);
  const [sort, setSort] = useState("name");
  const [view, setView] = useState(() => store.get("shelf-view") || "grid");
  const setViewSaved = (v) => { setView(v); store.set("shelf-view", v); };

  const sortKey = (n) => n.replace(/^(the|a|an) /i, "");
  const list = useMemo(() => {
    let L = collection;
    if (q) { const s = q.toLowerCase(); L = L.filter((f) => f.name.toLowerCase().includes(s)); }
    if (dec !== "all") L = L.filter((f) => decadeOf(f.year) === parseInt(dec));
    if (minR !== "all") L = L.filter((f) => f.rating != null && f.rating >= parseFloat(minR));
    if (edOnly) L = L.filter((f) => f.edition);
    if (tag !== "all") L = L.filter((f) => ((userData[fkey(f)] || {}).tags || []).includes(tag));
    const by = {
      name: (a, b) => sortKey(a.name).localeCompare(sortKey(b.name)),
      year: (a, b) => parseInt(b.year) - parseInt(a.year),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
      stale: (a, b) => (a.lastWatched || "").localeCompare(b.lastWatched || ""),
    };
    return [...L].sort(by[sort]);
  }, [collection, q, dec, minR, tag, edOnly, sort, userData]);

  const Pill = ({ on, onClick, children }) => <button className={"pill" + (on ? " on" : "")} aria-pressed={on} onClick={onClick}>{children}</button>;

  return (
    <div className="page">
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <label className="search">
          <Icon d={I.search} size={17} sw={2.2} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={"Search " + collection.length + " films"} />
        </label>
        <button className="btn-text" onClick={() => setViewSaved(view === "grid" ? "list" : "grid")} aria-label={view === "grid" ? "Show as list" : "Show as grid"}>
          <Icon d={view === "grid" ? I.list : I.grid} size={24} />
        </button>
      </div>

      <div className="pills" style={{ marginBottom: 8 }}>
        <Pill on={sort === "name"} onClick={() => setSort("name")}>A–Z</Pill>
        <Pill on={sort === "year"} onClick={() => setSort("year")}>Newest</Pill>
        <Pill on={sort === "rating"} onClick={() => setSort("rating")}>Top rated</Pill>
        <Pill on={sort === "stale"} onClick={() => setSort("stale")}>Longest unwatched</Pill>
      </div>
      <div className="pills" style={{ marginBottom: 8 }}>
        <Pill on={minR === "all" && !edOnly && tag === "all"} onClick={() => { setMinR("all"); setEdOnly(false); setTag("all"); }}>All</Pill>
        <Pill on={minR === "5"} onClick={() => setMinR(minR === "5" ? "all" : "5")}>5 stars</Pill>
        <Pill on={minR === "4.5"} onClick={() => setMinR(minR === "4.5" ? "all" : "4.5")}>4.5+</Pill>
        <Pill on={edOnly} onClick={() => setEdOnly(!edOnly)}>Special editions</Pill>
        {Object.entries(TAGS).map(([k, d]) => <Pill key={k} on={tag === k} onClick={() => setTag(tag === k ? "all" : k)}>{d.label}</Pill>)}
      </div>
      <div className="pills" style={{ marginBottom: 16 }}>
        <Pill on={dec === "all"} onClick={() => setDec("all")}>Every decade</Pill>
        {["1940", "1950", "1960", "1970", "1980", "1990", "2000", "2010", "2020"].map((d) => (
          <Pill key={d} on={dec === d} onClick={() => setDec(dec === d ? "all" : d)}>{d.slice(2)}s</Pill>
        ))}
      </div>

      <div className="section-header" style={{ padding: "0 0 8px" }}>{list.length === collection.length ? `${list.length} films` : `${list.length} of ${collection.length} films`}</div>

      {list.length === 0 ? (
        <div className="empty">
          No films match these filters.
          <div style={{ marginTop: 12 }}><button className="btn-text" onClick={onAdd}>Add a film</button></div>
        </div>
      ) : view === "grid" ? (
        <div className="grid">
          {list.map((f) => (
            <button key={fkey(f)} className="grid-item" onClick={() => onOpen(f)}>
              <Poster film={f} path={filmArt(f, userData, cache).poster} size="w185" />
              <div className="grid-caption">{f.name}</div>
              <div className="grid-meta">{f.year}{f.rating != null ? " · ★ " + f.rating : ""}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="group">
          {list.map((f) => {
            const tags = (userData[fkey(f)] || {}).tags || [];
            return (
              <button key={fkey(f)} className="row has-thumb" onClick={() => onOpen(f)} style={{ padding: "8px 16px" }}>
                <Poster film={f} path={filmArt(f, userData, cache).poster} size="w92" className="thumb" />
                <span className="row-main" style={{ padding: 0 }}>
                  <div className="row-title">{f.name}</div>
                  <div className="row-sub">{f.year} · {ratingText(f.rating)}{f.edition ? " · " + f.edition : ""}</div>
                </span>
                {tags.slice(0, 3).map((t) => <span key={t} className="dot" style={{ width: 8, height: 8, borderRadius: 4, background: TAGS[t].color, flexShrink: 0 }} />)}
                <Chevron />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── WANT LIST ──────────────────────────────────────────────────────────
function WantList({ want, setWantList, onBuy, owned }) {
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState(""); const [ny, setNy] = useState(""); const [nl, setNl] = useState("");
  const kindLabel = { upgrade: "Upgrade", new: "New to the shelf", gap: "Rated high, not owned" };

  const toggle = (i) => setWantList(want.map((w, j) => (j === i ? { ...w, bought: !w.bought } : w)));
  const remove = (i) => setWantList(want.filter((_, j) => j !== i));
  const add = () => {
    if (!nf.trim()) return;
    setWantList([{ film: nf.trim(), year: ny.trim(), label: nl.trim(), note: "", kind: "new", bought: false }, ...want]);
    setNf(""); setNy(""); setNl(""); setAdding(false);
  };

  const Item = ({ w }) => {
    const i = want.indexOf(w);
    const alreadyOwned = !w.bought && owned.has(w.film + "|" + w.year) && w.kind !== "upgrade";
    return (
      <div className="row" style={{ alignItems: "flex-start", padding: "11px 16px" }}>
        <button className={"check" + (w.bought ? " on" : "")} aria-pressed={w.bought} aria-label={(w.bought ? "Unmark " : "Mark ") + w.film + " as bought"} onClick={() => toggle(i)} style={{ marginTop: 1 }}>
          {w.bought && <Icon d={I.check} size={14} sw={3} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-title" style={{ whiteSpace: "normal", color: w.bought ? "var(--label-2)" : null }}>{w.film} <span style={{ color: "var(--label-2)" }}>{w.year}</span></div>
          <div className="want-note">{[w.label, kindLabel[w.kind]].filter(Boolean).join(" · ")}</div>
          {w.note && !w.bought && <div className="want-note">{w.note}</div>}
          {alreadyOwned && <div className="want-note" style={{ color: "var(--tint)" }}>Already on your shelf</div>}
          <div style={{ display: "flex", gap: 18, marginTop: 6 }}>
            {w.bought && <button className="btn-text" style={{ fontSize: 15 }} onClick={() => onBuy(w)}>Add to shelf</button>}
            <button className="btn-text" style={{ fontSize: 15, color: "var(--danger)" }} onClick={() => remove(i)}>Remove</button>
          </div>
        </div>
      </div>
    );
  };

  const active = want.filter((w) => !w.bought);
  const bought = want.filter((w) => w.bought);

  return (
    <div className="page">
      {adding ? (
        <Section header="Track a release">
          <div className="row"><input className="field" value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Title" autoFocus /></div>
          <div className="row"><input className="field" value={ny} onChange={(e) => setNy(e.target.value)} placeholder="Year" inputMode="numeric" /></div>
          <div className="row"><input className="field" value={nl} onChange={(e) => setNl(e.target.value)} placeholder="Edition, e.g. Arrow 4K" /></div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn-text" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn-text" style={{ fontWeight: 600 }} onClick={add}>Add</button>
          </div>
        </Section>
      ) : (
        <Section>
          <button className="row" onClick={() => setAdding(true)}><span className="row-main row-tint">Track a release</span></button>
        </Section>
      )}

      {active.length ? <Section header="Wanted">{active.map((w) => <Item key={want.indexOf(w)} w={w} />)}</Section>
        : <div className="empty">Nothing on the want list. Track a release you're eyeing.</div>}
      {bought.length > 0 && <Section header="Bought">{bought.map((w) => <Item key={want.indexOf(w)} w={w} />)}</Section>}
    </div>
  );
}

// ─── DATA ───────────────────────────────────────────────────────────────
function DataTab({ exportPayload, importAll, collection, want, watchLog, userData }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "the-shelf-backup-" + TODAY + ".json"; a.click();
    URL.revokeObjectURL(url);
    setMsg("Backup exported. Keep the file somewhere outside Safari, like Files or iCloud Drive.");
  };
  const doImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { importAll(JSON.parse(r.result)); setMsg("Backup restored."); } catch { setMsg("That file isn't a Shelf backup. Choose the .json file you exported."); } };
    r.readAsText(file);
    e.target.value = "";
  };

  const stat = (label, n) => <div className="row"><span className="row-main">{label}</span><span className="row-value">{n}</span></div>;
  const customPosters = Object.values(userData).filter((u) => u.poster).length;

  return (
    <div className="page">
      <Section header="Collection">
        {stat("Films", collection.length)}
        {stat("Added by you", collection.filter((f) => f.userAdded).length)}
        {stat("Tagged", Object.values(userData).filter((u) => u.tags && u.tags.length).length)}
        {stat("Custom posters", customPosters)}
        {stat("On want list", want.filter((w) => !w.bought).length)}
        {stat("Watches logged here", Object.keys(watchLog).length)}
      </Section>

      <Section header="Backup" footer={msg || "Tags, notes, poster choices, added films, the want list and watch log are stored only on this device. Export a backup now and then, and always before clearing Safari."}>
        <button className="row" onClick={doExport}><span className="row-main row-tint">Export backup</span></button>
        <button className="row" onClick={() => fileRef.current.click()}><span className="row-main row-tint">Restore from backup</span></button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={doImport} style={{ display: "none" }} />
      </Section>

      <div className="section-footer" style={{ padding: "0 16px 24px" }}>
        Film posters and metadata from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
      </div>
    </div>
  );
}

// ─── ROOT ───────────────────────────────────────────────────────────────
const TABS = [
  ["tonight", "Tonight", I.tonight],
  ["browse", "Shelf", I.shelf],
  ["want", "Want", I.want],
  ["data", "Data", I.data],
];
const TITLES = { tonight: "Tonight", browse: "The Shelf", want: "Want List", data: "Data" };

export default function App() {
  const D = useData();
  const cache = useMeta();
  const [tab, setTab] = useState("tonight");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  const collection = useMemo(() => {
    const seedKeys = new Set(SEED_COLLECTION.map(fkey));
    return [...SEED_COLLECTION, ...D.added.filter((f) => !seedKeys.has(fkey(f)))]
      .map((f) => ({ ...f, lastWatched: D.watchLog[fkey(f)] || f.lastWatched }));
  }, [D.added, D.watchLog]);
  const existing = useMemo(() => new Set(collection.map(fkey)), [collection]);
  const selectedFilm = selected ? collection.find((f) => fkey(f) === selected) : null;

  const openAdd = (p = null) => { setPrefill(p); setAdding(true); };
  const subtitle = { tonight: `${collection.length} films on hand`, browse: null, want: null, data: null }[tab];

  return (
    <div className="app">
      <header className={"nav" + (scrolled ? " scrolled" : "")}>
        <span className="nav-title">{TITLES[tab]}</span>
        {tab === "browse" && <button className="nav-action" onClick={() => openAdd()} aria-label="Add film"><Icon d={I.plus} size={24} sw={2} /></button>}
      </header>
      <div className="large-title">
        <h1>{TITLES[tab]}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      {tab === "tonight" && <Tonight collection={collection} userData={D.userData} cache={cache} onOpen={(f) => setSelected(fkey(f))} />}
      {tab === "browse" && <Browse collection={collection} userData={D.userData} cache={cache} onOpen={(f) => setSelected(fkey(f))} onAdd={() => openAdd()} />}
      {tab === "want" && <WantList want={D.want} setWantList={D.setWantList} owned={existing} onBuy={(w) => openAdd({ name: w.film, year: w.year, label: w.label })} />}
      {tab === "data" && <DataTab exportPayload={D.exportPayload} importAll={D.importAll} collection={collection} want={D.want} watchLog={D.watchLog} userData={D.userData} />}

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map(([k, l, ic]) => (
            <button key={k} className={"tab" + (tab === k ? " on" : "")} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
              <Icon d={ic} size={26} sw={tab === k ? 2 : 1.7} />{l}
            </button>
          ))}
        </div>
      </nav>

      {selectedFilm && (
        <FilmSheet key={selected} film={selectedFilm} userData={D.userData} cache={cache} onClose={() => setSelected(null)}
          onUpdate={D.updateFilm} onRemove={D.removeFilm} onLog={D.logWatch} />
      )}
      {adding && <AddSheet onClose={() => { setAdding(false); setPrefill(null); }} onAdd={D.addFilm} existing={existing} prefill={prefill} />}
    </div>
  );
}
