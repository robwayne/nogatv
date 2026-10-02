"use client";

import { useState } from "react";
import { ServiceBadge } from "@/components/ServiceBadge";
import { episodeTitle } from "@/lib/episodes";
import { rankCandidates, type Candidate } from "@/lib/rank";
import { useStore, type LibraryShow } from "@/lib/store";

/**
 * Shuffle within one show. Same ranking the rest of the site uses, so the
 * draw leans toward episodes we have not watched or rate highly, but it stays
 * a draw rather than a verdict.
 */
export function ShowShuffler({ show }: { show: LibraryShow }) {
  const { entries, showRating, episodeRating, setPlan, serviceFor } = useStore();
  const [pick, setPick] = useState<Candidate | null>(null);
  const [rolling, setRolling] = useState(false);
  const [saved, setSaved] = useState(false);

  const ranked = rankCandidates([show], entries, { showRating, episodeRating }, {
    deterministic: true,
  });

  function roll() {
    if (ranked.length === 0) return;
    setSaved(false);
    setRolling(true);
    window.setTimeout(() => {
      // Biased toward the top of the ranking without being a strict order.
      const index = Math.floor(Math.random() ** 2 * ranked.length);
      const next = ranked[index];
      setPick((prev) =>
        prev && next.code === prev.code && ranked.length > 1
          ? ranked[(index + 1) % ranked.length]
          : next,
      );
      setRolling(false);
    }, 380);
  }

  function tonight() {
    if (!pick) return;
    setPlan({
      date: new Date().toISOString().slice(0, 10),
      showId: show.id,
      season: pick.season,
      episode: pick.episode,
    });
    setSaved(true);
  }

  const where = serviceFor(show.id);

  return (
    <div>
      <div className="min-h-[72px]">
        {rolling ? (
          <p className="chroma text-xl uppercase tracking-[0.2em] text-vhs-dim">◀◀ rewinding…</p>
        ) : pick ? (
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold tracking-[0.1em]" style={{ color: show.color }}>
                {pick.partCodes?.length ? pick.partCodes.join(" + ") : pick.code}
              </span>
              <ServiceBadge id={where.id} fallback={!where.chosen} />
            </div>
            {episodeTitle(show.id, pick.season, pick.episode) ? (
              <p className="mt-1 text-sm text-vhs-text">
                {episodeTitle(show.id, pick.season, pick.episode)}
              </p>
            ) : null}
            {pick.reasons.length ? (
              <p className="mt-2 text-xs text-vhs-dim">{pick.reasons.join(" · ")}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-vhs-dim">
            {ranked.length
              ? "Roll for an episode of this one."
              : "No episode list for this show yet."}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[0.65rem] uppercase tracking-[0.2em]">
        <button
          type="button"
          onClick={roll}
          disabled={ranked.length === 0}
          className="rounded-sm border border-vhs-magenta px-3 py-1.5 text-vhs-magenta transition-colors hover:bg-vhs-magenta/10 disabled:opacity-40"
        >
          ⇄ {pick ? "again" : "shuffle this show"}
        </button>
        {pick ? (
          <button
            type="button"
            onClick={tonight}
            className="rounded-sm border border-vhs-line px-3 py-1.5 text-vhs-dim transition-colors hover:text-vhs-amber"
          >
            {saved ? "✓ on tonight" : "put it on tonight"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
