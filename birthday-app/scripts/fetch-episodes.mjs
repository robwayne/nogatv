/**
 * Pulls real episode data for every show in the library and writes it to
 * data/episodes.generated.json.
 *
 * Source is TVmaze: free, no API key, and it carries each show's IMDb id so
 * the site can link to IMDb even though IMDb itself has no free API.
 *
 * This runs at build time, not in the browser, so the published site stays
 * static and does not depend on anyone else's API being up. If the fetch
 * fails the existing JSON is left alone and the build carries on with it.
 *
 *   node scripts/fetch-episodes.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "data", "episodes.generated.json");
const CONTENT = path.join(here, "..", "data", "content.ts");

const API = "https://api.tvmaze.com";

/**
 * Where a title is ambiguous, pin the show by IMDb id, which is far less
 * guessable than a TVmaze id. A wrong id 404s and that show falls back to the
 * hand written counts, rather than silently importing the wrong series.
 */
const PINNED_IMDB = {
  // The original 2003 run, not the 2020 revival a title search lands on.
  reno911: "tt0370194",
};

/** Reads the seeded shows out of content.ts without importing TypeScript. */
async function seededShows() {
  const src = await fs.readFile(CONTENT, "utf8");
  const shows = [];
  const re = /\bid:\s*"([^"]+)",\s*\n\s*title:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const [, id, title] = m;
    // Recommendations and books live in the same file; only shows take ids
    // that aren't prefixed.
    if (id.startsWith("rec-") || id.startsWith("book-")) continue;
    shows.push({ id, title });
  }
  return shows;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "nogatv (personal site)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Episodes that are obviously parts of one story, by their titles. */
function detectParts(episodes) {
  const groups = new Map();

  for (const ep of episodes) {
    const name = ep.name ?? "";
    const match = name.match(/^(.*?)[\s,:]*\(?(?:part|pt\.?)\s*(\d+|one|two|three)\)?\s*$/i);
    if (!match) continue;
    const base = match[1].trim().toLowerCase();
    if (!base) continue;
    const key = `${ep.season}::${base}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ep);
  }

  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      season: g[0].season,
      episodes: g.map((e) => e.number).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.season - b.season || a.episodes[0] - b.episodes[0]);
}

async function fetchShow({ id, title }) {
  const pinned = PINNED_IMDB[id];
  const show = pinned
    ? await getJson(`${API}/lookup/shows?imdb=${pinned}`)
    : await getJson(`${API}/singlesearch/shows?q=${encodeURIComponent(title)}`);

  const episodes = await getJson(`${API}/shows/${show.id}/episodes`);

  // Specials come back as season 0; the guide only wants the real run.
  const real = episodes.filter((e) => e.season > 0 && e.number > 0);
  const seasons = [];
  for (const ep of real) seasons[ep.season - 1] = Math.max(seasons[ep.season - 1] ?? 0, ep.number);

  return {
    id,
    title: show.name,
    tvmazeId: show.id,
    imdbId: show.externals?.imdb ?? null,
    premiered: show.premiered ?? null,
    ended: show.ended ?? null,
    seasons: [...seasons].map((n) => n ?? 0),
    parts: detectParts(real),
    episodes: real.map((e) => ({
      season: e.season,
      number: e.number,
      name: e.name,
      airdate: e.airdate || null,
      runtime: e.runtime ?? null,
    })),
  };
}

const shows = await seededShows();
const out = {};
let failures = 0;

for (const show of shows) {
  try {
    out[show.id] = await fetchShow(show);
    const data = out[show.id];
    console.log(
      `  ${show.title}: ${data.episodes.length} episodes, ${data.seasons.length} seasons` +
        `${data.parts.length ? `, ${data.parts.length} multi-part` : ""}` +
        `${data.imdbId ? `, ${data.imdbId}` : ""}`,
    );
  } catch (error) {
    failures++;
    console.warn(`  ${show.title}: FAILED (${error.message})`);
  }
  // TVmaze asks for a light touch.
  await new Promise((r) => setTimeout(r, 350));
}

if (Object.keys(out).length === 0) {
  console.warn("Nothing fetched; leaving the existing file alone.");
  process.exit(0);
}

await fs.writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${failures} failed)`);
