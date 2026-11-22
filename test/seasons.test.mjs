// Run with: npm test
import assert from "node:assert/strict";
import { createServer } from "vite";

const v = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  const S = await v.ssrLoadModule("/src/seasons.js");
  const sh = await v.ssrLoadModule("/src/shelves.js");
  const raw = (await v.ssrLoadModule("/src/collection.json")).default;
  const owned = new Set((Array.isArray(raw) ? raw : raw.films).map((f) => f.name + "|" + f.year));
  const seed = (await v.ssrLoadModule("/src/seasons.json")).default.films;
  let n = 0;
  const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

  t("seed matches owned films by name + year (all but Dawn of the Dead 2004)", () => {
    const missing = seed.filter((f) => !owned.has(f.name + "|" + f.year)).map((f) => f.name + " " + f.year);
    assert.deepEqual(missing, ["Dawn of the Dead 2004"]);
  });
  t("seed maps names to ids, multi-select kept", () => {
    assert.deepEqual(S.SEASON_SEED["Singin' in the Rain|1952"], ["fall"]);
    assert.deepEqual(S.SEASON_SEED["Black Christmas|1974"], ["winter", "christmas", "halloween"]);
    assert.equal(S.SEASON_SEED["Heat|1995"], undefined); // not in the file stays untagged
  });
  t("seed only fills films with no season data of their own", () => {
    assert.deepEqual(S.filmSeasons({}, "The Shining|1980"), ["winter", "halloween"]);
    assert.deepEqual(S.filmSeasons(undefined, "The Shining|1980"), ["winter", "halloween"]);
    assert.deepEqual(S.filmSeasons({ seasons: ["fall"] }, "The Shining|1980"), ["fall"]);
    assert.deepEqual(S.filmSeasons({ seasons: [] }, "The Shining|1980"), []); // cleared by hand stays cleared
    assert.deepEqual(S.filmSeasons({ note: "x" }, "Heat|1995"), []);
  });
  t("defaults: Fall, Summer, Winter, Christmas, Halloween, no Spring", () => {
    assert.deepEqual(S.seasonList().map((x) => x[1]), ["Fall", "Summer", "Winter", "Christmas", "Halloween"]);
  });
  t("rename, remove and create-your-own", () => {
    const cfg = { custom: [{ id: "s:1", name: "Mardi Gras" }], names: { fall: "Autumn" }, hidden: ["summer"] };
    assert.deepEqual(S.seasonList(cfg).map((x) => x[1]), ["Autumn", "Winter", "Christmas", "Halloween", "Mardi Gras"]);
  });
  t("filter has No season yet; hidden-only films count as untagged", () => {
    const list = S.seasonList({ hidden: ["fall"], names: {}, custom: [] });
    const opts = S.seasonOptions(list);
    const none = opts.find((o) => o[0] === "noseason")[2];
    assert.equal(none({ seasons: [] }), true);
    assert.equal(none({ seasons: ["fall"] }), true);
    assert.equal(none({ seasons: ["winter"] }), false);
  });
  t("zero-count seasons are left out of the filter, No season yet is not", () => {
    const opts = S.seasonOptions(S.seasonList(), (test) => (test({ seasons: ["fall"] }) ? 1 : 0));
    assert.deepEqual(opts.map((o) => o[0]), ["fall", "noseason"]);
  });
  t("Season filter group sits right after Feel (Home picker)", () => {
    const keys = sh.makeFilters([], [], [], undefined, S.seasonList()).map((g) => g[0]);
    assert.equal(keys[keys.indexOf("feel") + 1], "season");
  });
  t("Home picker filter narrows by season", () => {
    const defs = sh.makeFilters([], [], [], undefined, S.seasonList());
    const test = sh.filterTest(defs, { season: "halloween" });
    const f = (seasons) => ({ tags: [], seasons, themes: [] });
    assert.equal(test(f(["halloween"])), true);
    assert.equal(test(f(["fall"])), false);
    assert.equal(sh.filterTest(defs, { season: "noseason" })(f([])), true);
  });

  // ── Home shelves ──
  const films = (Array.isArray(raw) ? raw : raw.films).map((f) => ({
    ...f, key: f.name + "|" + f.year, keywords: f.keywords || [], genres: f.genres || [], countries: f.countries || [],
    directors: f.directors || [], dop: f.dop || [], music: f.music || [], cast: f.cast || [], tags: [], copies: [], badges: [], themes: [],
    recentRank: 99, yearNum: f.year, special: false, seasons: S.filmSeasons({}, f.name + "|" + f.year),
  }));
  const shelvesOn = (iso, cfg) => sh.buildRecipes(films, [], [], undefined, cfg, new Date(iso + "T12:00:00")).filter((r) => r.id.startsWith("season:"));
  const ids = (list) => list.map((r) => r.id.slice(7)).sort();
  t("season windows", () => {
    assert.equal(S.seasonActive("halloween", new Date("2026-10-15T12:00:00")), true);
    assert.equal(S.seasonActive("halloween", new Date("2026-11-02T12:00:00")), false);
    assert.equal(S.seasonActive("winter", new Date("2027-01-10T12:00:00")), true); // wraps over New Year
    assert.equal(S.seasonActive("winter", new Date("2026-07-04T12:00:00")), false);
    assert.equal(S.seasonActive("summer", new Date("2026-07-04T12:00:00")), true);
  });
  t("October: Halloween is pinned, Fall is dealt more often, nothing else", () => {
    const on = shelvesOn("2026-10-15");
    assert.deepEqual(ids(on), ["fall", "halloween"]);
    assert.equal(on.find((r) => r.id === "season:halloween").pin, true);
    assert.equal(on.find((r) => r.id === "season:fall").pin, false);
  });
  t("late November: Christmas pinned, Fall still around; early December adds Winter", () => {
    assert.deepEqual(ids(shelvesOn("2026-11-22")), ["christmas", "fall"]);
    assert.deepEqual(ids(shelvesOn("2026-12-05")), ["christmas", "winter"]);
  });
  t("July: just Summer. Removed or renamed built-ins are respected", () => {
    assert.deepEqual(ids(shelvesOn("2026-07-04")), ["summer"]);
    assert.equal(shelvesOn("2026-07-04")[0].pin, true); // no specific season on, so the general one is pinned
    assert.deepEqual(ids(shelvesOn("2026-07-04", { hidden: ["summer"], names: {}, custom: [] })), []);
    assert.equal(shelvesOn("2026-07-04", { hidden: [], names: { summer: "Beach" }, custom: [] })[0].title, "Beach watches");
  });
  t("pinned shelves are dealt first and always", () => {
    const dealt = sh.dealShelves(shelvesOn("2026-10-15"), 7, 1);
    assert.equal(dealt[0].id, "season:halloween");
  });
  t("season shelves stay out of the Home picker's Shelf group", () => {
    const defs = sh.makeFilters([], [], shelvesOn("2026-10-15"), undefined, S.seasonList());
    const shelf = defs.find((g) => g[0] === "shelf");
    assert.equal(!!shelf && shelf[2].some((o) => String(o[0]).startsWith("season:")), false);
  });
  console.log(`\n${n} passed`);
} finally {
  await v.close();
}
