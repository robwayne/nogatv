"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  SLOTS_PER_DAY,
  buildGuide,
  currentSlot,
  programAt,
  slotLabel,
  type Channel,
  type GuideFilter,
  type Program,
} from "@/lib/guide";
import { ServiceBadge } from "@/components/ServiceBadge";
import { episodeTitle } from "@/lib/episodes";
import { SITE } from "@/data/content";
import { useStore } from "@/lib/store";

const ROW_HEIGHT = 92;
const VISIBLE_ROWS = 5;
const SCROLL_MS = 3400;
const COLUMNS = 3;

/** The blue-and-gold listings grid, scrolling on its own like it's 1996. */
/** The episode's name for a program, when the build fetched one. */
function titleOf(program: Program) {
  const parsed = program.episode?.match(/^S(\d+)E(\d+)$/);
  if (!parsed) return null;
  return episodeTitle(program.show.id, Number(parsed[1]), Number(parsed[2]));
}

export function TvGuide() {
  const { ready, shows, entries, setPlan, showRating, episodeRating, serviceFor } = useStore();
  const [slot, setSlot] = useState(() => currentSlot());
  // The lineup belongs to one calendar day; when the date rolls over at
  // midnight this changes and the whole guide rebuilds.
  const [day, setDay] = useState(() => new Date().toDateString());
  const [filter, setFilter] = useState<GuideFilter>("all");
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<{ channel: Channel; program: Program } | null>(null);
  const [planned, setPlanned] = useState<string | null>(null);
  const animating = useRef(true);

  const channels = useMemo(
    () =>
      ready
        ? buildGuide(shows, entries, new Date(day), filter, { showRating, episodeRating })
        : [],
    // showRating/episodeRating change identity whenever a rating does, which is
    // exactly when the lineup should be rebuilt.
    [ready, shows, entries, day, filter, showRating, episodeRating],
  );

  // Creep down the channel list the way the real thing did.
  useEffect(() => {
    if (paused || channels.length <= VISIBLE_ROWS) return;
    const id = window.setInterval(() => setOffset((o) => o + 1), SCROLL_MS);
    return () => window.clearInterval(id);
  }, [paused, channels.length]);

  // Snap back to the top without a visible rewind once we've been all the way round.
  useEffect(() => {
    if (channels.length === 0 || offset < channels.length) return;
    const id = window.setTimeout(() => {
      animating.current = false;
      setOffset(0);
      window.setTimeout(() => {
        animating.current = true;
      }, 50);
    }, 900);
    return () => window.clearTimeout(id);
  }, [offset, channels.length]);

  // Keep the clock honest.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSlot(currentSlot());
      setDay(new Date().toDateString());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const highlight = useMemo(() => {
    if (selected) return selected;
    const channel = channels[offset % Math.max(1, channels.length)];
    if (!channel) return null;
    const program = programAt(channel, slot % SLOTS_PER_DAY);
    return program ? { channel, program } : null;
  }, [selected, channels, offset, slot]);

  const columns = Array.from({ length: COLUMNS }, (_, i) => (slot + i) % SLOTS_PER_DAY);

  function watchIt(program: Program) {
    const today = new Date().toISOString().slice(0, 10);
    const [, season, episode] = program.episode?.match(/S(\d+)E(\d+)/) ?? [];
    setPlan({
      date: today,
      showId: program.show.id,
      season: season ? Number(season) : undefined,
      episode: episode ? Number(episode) : undefined,
    });
    setPlanned(program.show.id);
  }

  if (!ready) {
    return <div className="h-[540px] animate-pulse rounded-md bg-[#0b1046]" />;
  }

  if (channels.length === 0) {
    return (
      <p className="text-sm text-vhs-dim">
        {filter !== "all" ? (
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="mr-2 text-vhs-cyan underline"
          >
            Nothing on this half of the library. Show everything?
          </button>
        ) : null}
        Nothing in the library yet. Add a show on the{" "}
        <Link href="/" className="text-vhs-cyan underline">
          main page
        </Link>{" "}
        and the guide fills itself in.
      </p>
    );
  }

  const rows = [...channels, ...channels];

  const FILTERS: { id: GuideFilter; label: string }[] = [
    { id: "all", label: "everything" },
    { id: "watched", label: "shows we've watched" },
    { id: "watchlist", label: "shows we haven't" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-vhs-dim">
        <span>broadcasting</span>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFilter(f.id);
              setOffset(0);
              setSelected(null);
            }}
            className={`rounded-sm border px-2.5 py-1 transition-colors ${
              filter === f.id
                ? "border-vhs-amber text-vhs-amber"
                : "border-vhs-line text-vhs-dim hover:text-vhs-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-[#2b3aa0] bg-[#050830] shadow-[0_0_60px_-20px_#3b4fd8]">
      {/* ── the promo window ─────────────────────────────────────────── */}
      <div className="relative border-b-2 border-[#2b3aa0] bg-gradient-to-b from-[#101a6e] to-[#070c3a] p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-[#8fa2ff]">
          <span className="text-[#ffd84d]">TV GUIDE</span>
          <span>
            {new Date(day).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span className="text-[#6d7cc9]">midnight to midnight</span>
          <span className="ml-auto">{slotLabel(slot)}</span>
        </div>

        {highlight ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em]">
              <ServiceBadge
                id={serviceFor(highlight.program.show.id).id}
                fallback={!serviceFor(highlight.program.show.id).chosen}
                size="md"
              />
              <span style={{ color: highlight.channel.tint }}>
                {highlight.channel.name} · 24/7
              </span>
            </div>
            <h3 className="mt-2 text-2xl font-bold leading-tight text-[#ffd84d] sm:text-4xl">
              {titleOf(highlight.program) ?? highlight.program.show.title}
              {highlight.program.episode ? (
                <span className="ml-3 text-base font-normal tracking-[0.2em] text-[#8fa2ff]">
                  {highlight.program.episode}
                </span>
              ) : null}
            </h3>
            <p className="mt-2 max-w-2xl text-sm italic text-[#c7d0ff]">{highlight.program.blurb}</p>
            <p className="mt-1 max-w-2xl text-xs text-[#6d7cc9]">{highlight.channel.tagline}</p>

            <div className="mt-4 flex flex-wrap gap-3 text-[0.65rem] uppercase tracking-[0.2em]">
              <button
                type="button"
                onClick={() => watchIt(highlight.program)}
                className="rounded-sm border border-[#ffd84d] px-3 py-1.5 text-[#ffd84d] transition-colors hover:bg-[#ffd84d]/10"
              >
                {planned === highlight.program.show.id ? "✓ on tonight" : "watch this tonight"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPaused(false);
                }}
                className="rounded-sm border border-[#2b3aa0] px-3 py-1.5 text-[#8fa2ff] transition-colors hover:text-[#ffd84d]"
              >
                {selected ? "back to live" : paused ? "paused" : "scrolling"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── time header ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-[6.75rem_1fr] border-b border-[#2b3aa0] bg-[#0b1352] text-[0.6rem] uppercase tracking-[0.2em] text-[#8fa2ff] sm:grid-cols-[8rem_repeat(3,1fr)] sm:text-[0.65rem]">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setSlot((s) => (s - 1 + SLOTS_PER_DAY) % SLOTS_PER_DAY)}
            aria-label="Earlier"
            className="hover:text-[#ffd84d]"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => setSlot(currentSlot())}
            className="hover:text-[#ffd84d]"
          >
            now
          </button>
          <button
            type="button"
            onClick={() => setSlot((s) => (s + 1) % SLOTS_PER_DAY)}
            aria-label="Later"
            className="hover:text-[#ffd84d]"
          >
            ▶
          </button>
        </div>
        {columns.map((c, i) => (
          <div
            key={c}
            className={`border-l border-[#2b3aa0] px-3 py-2 ${i > 0 ? "hidden sm:block" : ""}`}
          >
            {slotLabel(c)}
          </div>
        ))}
      </div>

      {/* ── the listings ─────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ height: ROW_HEIGHT * VISIBLE_ROWS }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => {
          if (!selected) setPaused(false);
        }}
      >
        <div
          style={{
            transform: `translateY(-${offset * ROW_HEIGHT}px)`,
            transition: animating.current ? "transform 900ms ease-in-out" : "none",
          }}
        >
          {rows.map((channel, i) => (
            <div
              key={`${channel.show.id}-${i}`}
              className="grid grid-cols-[6.75rem_1fr] border-b border-[#1c2780] sm:grid-cols-[8rem_repeat(3,1fr)]"
              style={{ height: ROW_HEIGHT }}
            >
              <div
                className="flex flex-col justify-center gap-1 border-r border-[#2b3aa0] px-3"
                style={{ background: `linear-gradient(90deg, ${channel.tint}22, transparent)` }}
              >
                <ServiceBadge
                  id={serviceFor(channel.show.id).id}
                  fallback={!serviceFor(channel.show.id).chosen}
                />
                <span
                  className="text-[0.6rem] font-bold uppercase leading-tight tracking-[0.1em]"
                  style={{ color: channel.tint }}
                >
                  {channel.name}
                </span>
              </div>

              {columns.map((c, i) => {
                const program = programAt(channel, c);
                const isStart = program?.start === c;
                const isNow = c === slot;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      if (!program) return;
                      setSelected({ channel, program });
                      setPaused(true);
                      setPlanned(null);
                    }}
                    className={`border-l border-[#1c2780] px-3 py-2 text-left transition-colors hover:bg-[#1a2596] ${
                      i > 0 ? "hidden sm:block" : ""
                    }`}
                    style={{ background: isNow ? "#111c6b" : undefined }}
                  >
                    {program ? (
                      isStart ? (
                        <>
                          <div className="line-clamp-2 text-sm font-bold leading-snug text-[#ffd84d]">
                            {program.show.title}
                          </div>
                          {program.episode ? (
                            <div className="mt-0.5 text-[0.6rem] tracking-[0.15em] text-[#8fa2ff]">
                              {program.episode}
                              {titleOf(program) ? (
                                <span className="ml-1.5 normal-case tracking-normal text-[#c7d0ff]">
                                  {titleOf(program)}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="mt-0.5 line-clamp-1 text-[0.65rem] italic text-[#6d7cc9]">
                            {program.blurb}
                          </div>
                        </>
                      ) : (
                        <div className="text-[0.65rem] uppercase tracking-[0.2em] text-[#6d7cc9]">
                          ← cont'd
                        </div>
                      )
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── the ticker ───────────────────────────────────────────────── */}
      <div className="overflow-hidden border-t-2 border-[#2b3aa0] bg-[#0b1352] py-2">
        <div className="ticker whitespace-nowrap text-[0.65rem] uppercase tracking-[0.25em] text-[#ffd84d]">
          ★ happy 28th birthday {SITE.herFullName} ★ friends since {SITE.friendsSince} ★ broadcasting
          from {SITE.where} ★ all channels, all night ★ nothing good on? there is, scroll down ★
        </div>
      </div>
      </div>
    </div>
  );
}
