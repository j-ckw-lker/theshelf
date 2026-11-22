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
