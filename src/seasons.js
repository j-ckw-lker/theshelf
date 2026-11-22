// Season: "when I want to watch it", not when it's set. Multi-select per film, editable like Feels.
// The seed (src/seasons.json) only fills films whose own season data has never been touched, so an edit always wins.
import seedRaw from "./seasons.json";

export const SEASONS = [["fall", "Fall"], ["summer", "Summer"], ["winter", "Winter"], ["christmas", "Christmas"], ["halloween", "Halloween"]];
const ID_BY_NAME = Object.fromEntries(SEASONS.map(([id, name]) => [name.toLowerCase(), id]));

// "Name|year" -> season ids. Each entry's `basis` ("your list" / "my call") is kept in the file but not used here.
export const SEASON_SEED = Object.fromEntries(
  seedRaw.films
    .map((f) => [f.name + "|" + f.year, (f.seasons || []).map((n) => ID_BY_NAME[String(n).toLowerCase()]).filter(Boolean)])
    .filter(([, ids]) => ids.length),
);

// Prefs mirror Feels: your own seasons, renamed built-ins, and built-ins you've removed (films keep them quietly).
export const NO_SEASON_CFG = { custom: [], names: {}, hidden: [] };
export const seasonList = (cfg = NO_SEASON_CFG) => [
  ...SEASONS.filter(([id]) => !(cfg.hidden || []).includes(id)).map(([id, title]) => [id, (cfg.names || {})[id] || title]),
  ...(cfg.custom || []).map((c) => [c.id, c.name]),
];

// A film that has been edited (even down to no seasons) uses its own list. Otherwise it takes the seed, if it has one.
export const filmSeasons = (u, key) => (Array.isArray(u?.seasons) ? u.seasons : SEASON_SEED[key] || []);

// Filter options. "No season yet" is there so untagged films don't vanish from results.
export const seasonOptions = (list = seasonList(), count = () => 1) => {
  const shown = new Set(list.map((x) => x[0]));
  return [
    ...list.map(([id, title]) => [id, title, (f) => f.seasons.includes(id)]).filter((o) => count(o[2]) > 0),
    ["noseason", "No season yet", (f) => !f.seasons.some((id) => shown.has(id))],
  ];
};

// Home shelves. Each built-in season shows up when it's the right time of year ([month, day] start and end, inclusive,
// wrapping over New Year when the start is after the end). Your own seasons have no dates, so they stay filters only.
// Halloween and Christmas are the specific ones: while one is on, it's pinned to the top of Home and the general
// seasons (Fall, Winter, Summer) just get a better chance of being dealt. With no specific one on, the general
// season is pinned instead, so Summer shows up all summer.
export const SEASON_WINDOWS = {
  halloween: [[9, 20], [11, 1]],
  christmas: [[11, 20], [12, 31]],
  fall: [[9, 1], [11, 30]],
  winter: [[12, 1], [2, 28]],
  summer: [[5, 25], [8, 31]],
};
export const SPECIFIC_SEASONS = ["halloween", "christmas"];
export const seasonActive = (id, date = new Date()) => {
  const w = SEASON_WINDOWS[id];
  if (!w) return false;
  const d = new Date(date);
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  const a = w[0][0] * 100 + w[0][1], b = w[1][0] * 100 + w[1][1];
  return a <= b ? md >= a && md <= b : md >= a || md <= b;
};
