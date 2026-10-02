"use client";

import { useState } from "react";
import { Stars } from "@/components/Stars";
import { episodeTitle } from "@/lib/episodes";
import { episodeCode } from "@/lib/rank";
import { useStore, type LibraryShow } from "@/lib/store";

/**
 * Season-by-season episode list with a rating on each one. These ratings are
 * what the recommender actually compares across shows, so rating a handful of
 * standouts is the most useful thing either of us can do here.
 */
export function EpisodeRatings({ show }: { show: LibraryShow }) {
  const { episodeRating, setEpisodeRating, entries } = useStore();
  const seasons = show.seasons ?? [];
  const [open, setOpen] = useState<number | null>(seasons.length ? 1 : null);

  if (!seasons.length) {
    return (
      <p className="text-xs text-vhs-dim">No episode list for this one yet.</p>
    );
  }

  const logged = new Set(
    entries
      .filter((e) => e.showId === show.id && e.season && e.episode)
      .map((e) => `${e.season}:${e.episode}`),
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {seasons.map((_, i) => {
          const season = i + 1;
          const active = open === season;
          return (
            <button
              key={season}
              type="button"
              onClick={() => setOpen(active ? null : season)}
              className={`rounded-sm border px-2 py-1 text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                active
                  ? "border-vhs-amber text-vhs-amber"
                  : "border-vhs-line text-vhs-dim hover:text-vhs-text"
              }`}
            >
              S{season}
            </button>
          );
        })}
      </div>

      {open ? (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {Array.from({ length: seasons[open - 1] ?? 0 }, (_, i) => {
            const episode = i + 1;
            const rating = episodeRating(show.id, open, episode);
            return (
              <li
                key={episode}
                className="flex items-center gap-2 rounded-sm px-2 py-1 text-xs odd:bg-white/[0.02]"
              >
                <span className="w-16 shrink-0 tracking-[0.1em] text-vhs-dim">
                  {episodeCode(open, episode)}
                </span>
                {episodeTitle(show.id, open, episode) ? (
                  <span className="min-w-0 flex-1 truncate text-vhs-text">
                    {episodeTitle(show.id, open, episode)}
                  </span>
                ) : null}
                <Stars
                  value={rating}
                  onChange={(v) => setEpisodeRating(show.id, open, episode, v)}
                />
                {logged.has(`${open}:${episode}`) ? (
                  <span className="text-[0.55rem] uppercase tracking-[0.15em] text-vhs-line">
                    seen
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
