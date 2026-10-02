import generated from "@/data/episodes.generated.json";

/**
 * Episode data pulled from TVmaze at build time by scripts/fetch-episodes.mjs.
 * Everything here degrades quietly: with an empty file the site behaves exactly
 * as it did before, using the hand written season counts in content.ts.
 */
export type GeneratedEpisode = {
  season: number;
  number: number;
  name: string;
  airdate: string | null;
  runtime: number | null;
};

export type GeneratedShow = {
  id: string;
  title: string;
  tvmazeId: number;
  imdbId: string | null;
  premiered: string | null;
  ended: string | null;
  seasons: number[];
  parts: { season: number; episodes: number[] }[];
  episodes: GeneratedEpisode[];
};

const DATA = generated as Record<string, GeneratedShow>;

export function generatedShow(showId: string): GeneratedShow | undefined {
  return DATA[showId];
}

/** "The Doll" for S04E05, or null when we have no episode list. */
export function episodeTitle(showId: string, season?: number, episode?: number): string | null {
  if (!season || !episode) return null;
  const found = DATA[showId]?.episodes.find((e) => e.season === season && e.number === episode);
  return found?.name ?? null;
}

export function imdbUrl(showId: string): string | null {
  const id = DATA[showId]?.imdbId;
  return id ? `https://www.imdb.com/title/${id}/` : null;
}
