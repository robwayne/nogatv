"use client";

import { useState } from "react";
import { ServiceBadge } from "@/components/ServiceBadge";
import { episodeTitle } from "@/lib/episodes";
import { bestCandidate, rankCandidates, type Candidate } from "@/lib/rank";
import { useStore } from "@/lib/store";

type Mood = "any" | "comfort" | "new";

const MOODS: { id: Mood; label: string }[] = [
  { id: "any", label: "anything" },
  { id: "comfort", label: "comfort rewatch" },
  { id: "new", label: "something new" },
];

export function TonightPicker() {
  const { ready, shows, entries, showRating, episodeRating, setPlan, serviceFor } = useStore();
  const [mood, setMood] = useState<Mood>("any");
  const [pick, setPick] = useState<Candidate | null>(null);
  const [rolling, setRolling] = useState(false);
  const [saved, setSaved] = useState(false);

  const ratings = { showRating, episodeRating };
  const status = mood === "comfort" ? "watched" : mood === "new" ? "watchlist" : undefined;

  function land(next: Candidate | null) {
    setSaved(false);
    setRolling(true);
    window.setTimeout(() => {
      setPick(next);
      setRolling(false);
    }, 450);
  }

  /** Pure chance, weighted by nothing. */
  function shuffle() {
    const all = rankCandidates(shows, entries, ratings, { status, deterministic: true });
    land(all.length ? all[Math.floor(Math.random() * all.length)] : null);
  }

  /** The considered answer: best episode in the library right now. */
  function recommend() {
    land(bestCandidate(shows, entries, ratings, { status }));
  }

  function saveForTonight() {
    if (!pick) return;
    setPlan({
      date: new Date().toISOString().slice(0, 10),
      showId: pick.show.id,
      season: pick.season,
      episode: pick.episode,
    });
    setSaved(true);
  }

  return (
    <div className="tape rounded-md p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.65rem] uppercase tracking-[0.2em] text-vhs-dim">
        <span>mood</span>
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMood(m.id)}
            className={`rounded-sm border px-2.5 py-1 transition-colors ${
              mood === m.id
                ? "border-vhs-cyan text-vhs-cyan"
                : "border-vhs-line text-vhs-dim hover:text-vhs-text"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-6 min-h-[140px]">
        {rolling ? (
          <p className="chroma text-2xl uppercase tracking-[0.2em] text-vhs-dim sm:text-3xl">
            ◀◀ rewinding…
          </p>
        ) : pick ? (
          <div>
            <p
              className="text-[0.65rem] uppercase tracking-[0.3em]"
              style={{ color: pick.show.color }}
            >
              tonight
            </p>
            <h3 className="chroma-soft mt-1 text-3xl font-bold leading-tight sm:text-4xl">
              {pick.show.title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {pick.code ? (
                <span className="text-sm tracking-[0.2em] text-vhs-amber">
                  {pick.partCodes?.length ? pick.partCodes.join(" + ") : pick.code}
                </span>
              ) : null}
              <ServiceBadge
                id={serviceFor(pick.show.id).id}
                fallback={!serviceFor(pick.show.id).chosen}
              />
            </div>
            {episodeTitle(pick.show.id, pick.season, pick.episode) ? (
              <p className="mt-2 text-base text-vhs-text">
                {episodeTitle(pick.show.id, pick.season, pick.episode)}
              </p>
            ) : null}
            <p className="mt-3 max-w-xl text-sm text-vhs-dim">
              {pick.reasons.length
                ? pick.reasons.join(" · ")
                : "No ratings to go on yet, so this one's a straight guess."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-vhs-dim">
            Press something. Anything. We&apos;ve been scrolling for twenty minutes.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-[0.7rem] uppercase tracking-[0.2em]">
        <button
          type="button"
          disabled={!ready}
          onClick={shuffle}
          className="rounded-sm border border-vhs-magenta px-4 py-2 text-vhs-magenta transition-colors hover:bg-vhs-magenta/10"
        >
          ⇄ shuffle
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={recommend}
          className="rounded-sm border border-vhs-cyan px-4 py-2 text-vhs-cyan transition-colors hover:bg-vhs-cyan/10"
        >
          ★ what should we watch next
        </button>
        {pick ? (
          <button
            type="button"
            onClick={saveForTonight}
            className="rounded-sm border border-vhs-line px-4 py-2 text-vhs-dim transition-colors hover:text-vhs-amber"
          >
            {saved ? "✓ on the calendar" : "put it on tonight"}
          </button>
        ) : null}
      </div>

    </div>
  );
}
