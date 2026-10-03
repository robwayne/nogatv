"use client";

import type { GeneratedShow } from "@/lib/episodes";

/**
 * Looks a show up from the browser when one is added on the fly.
 *
 * Same source as the build time script, TVmaze, which allows cross origin
 * requests and needs no key. IMDb has no free API, so what we take from here
 * is the IMDb id, which is enough to link out to it.
 */

const API = "https://api.tvmaze.com";

/** Episodes whose titles say they are parts of one story. */
function detectParts(episodes: { season: number; number: number; name: string }[]) {
  const groups = new Map<string, { season: number; number: number }[]>();

  for (const ep of episodes) {
    const match = ep.name?.match(/^(.*?)[\s,:]*\(?(?:part|pt\.?)\s*(\d+|one|two|three)\)?\s*$/i);
    if (!match) continue;
    const base = match[1].trim().toLowerCase();
    if (!base) continue;
    const key = `${ep.season}::${base}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ep);
  }

  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      season: g[0].season,
      episodes: g.map((e) => e.number).sort((a, b) => a - b),
    }));
}

export async function lookupShow(id: string, title: string): Promise<GeneratedShow | null> {
  try {
    const showRes = await fetch(`${API}/singlesearch/shows?q=${encodeURIComponent(title)}`);
    if (!showRes.ok) return null;
    const show = await showRes.json();

    const episodesRes = await fetch(`${API}/shows/${show.id}/episodes`);
    if (!episodesRes.ok) return null;
    const episodes = await episodesRes.json();

    // Specials come back as season 0; only the real run is useful here.
    const real = episodes.filter(
      (e: { season: number; number: number }) => e.season > 0 && e.number > 0,
    );
    if (real.length === 0) return null;

    const seasons: number[] = [];
    for (const ep of real) {
      seasons[ep.season - 1] = Math.max(seasons[ep.season - 1] ?? 0, ep.number);
    }

    return {
      id,
      title: show.name,
      tvmazeId: show.id,
      imdbId: show.externals?.imdb ?? null,
      premiered: show.premiered ?? null,
      ended: show.ended ?? null,
      seasons: seasons.map((n) => n ?? 0),
      parts: detectParts(real),
      episodes: real.map((e: Record<string, unknown>) => ({
        season: e.season as number,
        number: e.number as number,
        name: e.name as string,
        airdate: (e.airdate as string) || null,
        runtime: (e.runtime as number) ?? null,
      })),
    };
  } catch {
    // Offline, blocked, or TVmaze having a day. The show still works, it just
    // has no episode list.
    return null;
  }
}
