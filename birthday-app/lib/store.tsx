"use client";

/**
 * All of the state that lives in the browser: shows added on the fly, which
 * ones are watched, and what we've scheduled to watch on which night.
 *
 * Seed shows come from data/content.ts. Anything done in the UI is layered on
 * top and saved to localStorage, so the seed file stays the source of truth for
 * the writing and the browser holds the day-to-day stuff.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BOOKS,
  RECOMMENDATIONS,
  SITE,
  WATCHED,
  WATCHLIST,
  type Book,
  type Rec,
  type Show,
} from "@/data/content";
import { generatedShow } from "@/lib/episodes";
import { mergeState, pullState, pushState, subscribe, syncConfigured } from "@/lib/sync";
import { DEFAULT_SERVICE, isKnownService } from "@/lib/services";

export type Status = "watched" | "watchlist";

export type LibraryShow = Show & {
  status: Status;
  /** True when it was added in the browser rather than in data/content.ts. */
  custom: boolean;
};

export type Profile = {
  id: string;
  name: string;
  color: string;
};

/** One Letterboxd-style entry: a rating and a few words about one episode. */
export type LogEntry = {
  id: string;
  profileId: string;
  showId: string;
  season?: number;
  episode?: number;
  /** 1–5. */
  rating: number;
  text: string;
  /** ISO date the entry was written. */
  createdAt: string;
};

/**
 * Ratings live apart from the log. A log entry is "what we thought on the
 * night"; a rating is the standing verdict on a show or on one episode, and
 * either can exist without the other — including for things we haven't
 * watched yet, where a rating is really a guess at how much we'll like it.
 */
export type Plan = {
  /** YYYY-MM-DD */
  date: string;
  showId: string;
  season?: number;
  episode?: number;
  note?: string;
};

export type LibraryRec = Rec & { custom: boolean };

export type LibraryBook = Book & { custom: boolean };

type Persisted = {
  customShows: (Show & { status: Status })[];
  customRecs: Rec[];
  recDone: Record<string, boolean>;
  removedRecIds: string[];
  /** Edits layered over the seeded recommendations in data/content.ts. */
  recEdits: Record<string, Partial<Rec>>;
  customBooks: Book[];
  bookEdits: Record<string, Partial<Book>>;
  removedBookIds: string[];
  statusOverrides: Record<string, Status>;
  removedIds: string[];
  plans: Plan[];
  activeProfileId: string | null;
  entries: LogEntry[];
  /** showId -> service id from lib/services.ts */
  services: Record<string, string>;
  /** showId -> 1..5 */
  showRatings: Record<string, number>;
  /** "showId:season:episode" -> 1..5 */
  episodeRatings: Record<string, number>;
};

const DEFAULT_PROFILES: Profile[] = [
  { id: "her", name: SITE.herName, color: "#ff4ecd" },
  { id: "me", name: SITE.fromName, color: "#4ce0e8" },
];

const EMPTY: Persisted = {
  customShows: [],
  customRecs: [],
  recDone: {},
  removedRecIds: [],
  recEdits: {},
  customBooks: [],
  bookEdits: {},
  removedBookIds: [],
  statusOverrides: {},
  removedIds: [],
  plans: [],
  activeProfileId: null,
  entries: [],
  services: {},
  showRatings: {},
  episodeRatings: {},
};

const KEY = "tapes.v1";

const SEED_SHOWS: Show[] = [...WATCHED, ...WATCHLIST];

const PALETTE = [
  "#f7d046",
  "#4ce0b3",
  "#7ec8ff",
  "#ff8fb1",
  "#c58cff",
  "#ffb45e",
  "#68e08a",
  "#ff6b6b",
];

function load(): Persisted {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Persisted>) };
  } catch {
    return EMPTY;
  }
}

function save(state: Persisted) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private browsing, quota, etc. — the seed content still renders fine */
  }
}

export function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `show-${Date.now()}`;
}

export function initialsFor(title: string) {
  const words = title.replace(/[^a-zA-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}


/**
 * A recommendation for something watchable should also exist in the library,
 * otherwise the shuffler and the guide can't actually suggest it. Matches an
 * existing show by title first; failing that, creates one on the watchlist.
 * Books live on their own shelf and never come through here.
 */
function linkRecToLibrary(
  prev: Persisted,
  rec: Rec,
  seedShows: Show[],
): { rec: Rec; customShows: (Show & { status: Status })[] } {
  if (rec.showId) return { rec, customShows: prev.customShows };

  const title = rec.title.trim().toLowerCase();
  const existing = [...seedShows, ...prev.customShows].find(
    (s) => s.title.trim().toLowerCase() === title && !prev.removedIds.includes(s.id),
  );
  if (existing) return { rec: { ...rec, showId: existing.id }, customShows: prev.customShows };

  const taken = new Set([...seedShows.map((s) => s.id), ...prev.customShows.map((s) => s.id)]);
  let id = slugify(rec.title);
  let n = 2;
  while (taken.has(id)) id = `${slugify(rec.title)}-${n++}`;

  const show: Show & { status: Status } = {
    id,
    title: rec.title.trim(),
    years: rec.year?.trim() || "",
    initials: initialsFor(rec.title),
    color: PALETTE[taken.size % PALETTE.length],
    note: rec.note?.trim() || "",
    status: "watchlist",
    ...(rec.kind === "film" ? { kind: "movie" as const } : {}),
  };

  return { rec: { ...rec, showId: id }, customShows: [...prev.customShows, show] };
}

type Ctx = {
  ready: boolean;
  /** True when this browser is backed by Supabase rather than itself. */
  synced: boolean;
  shows: LibraryShow[];
  watched: LibraryShow[];
  watchlist: LibraryShow[];
  plans: Plan[];
  profiles: Profile[];
  activeProfile: Profile | null;
  entries: LogEntry[];
  byId: (id: string) => LibraryShow | undefined;
  setActiveProfile: (id: string | null) => void;
  addEntry: (entry: Omit<LogEntry, "id" | "profileId" | "createdAt">) => void;
  removeEntry: (id: string) => void;
  entriesForShow: (showId: string) => LogEntry[];
  showRatings: Record<string, number>;
  episodeRatings: Record<string, number>;
  setShowRating: (showId: string, rating: number) => void;
  setEpisodeRating: (showId: string, season: number, episode: number, rating: number) => void;
  showRating: (showId: string) => number;
  episodeRating: (showId: string, season: number, episode: number) => number;
  books: LibraryBook[];
  addBook: (book: Omit<Book, "id" | "color">) => void;
  updateBook: (id: string, patch: Partial<Omit<Book, "id">>) => void;
  removeBook: (id: string) => void;
  recs: LibraryRec[];
  addRec: (rec: Omit<Rec, "id">) => void;
  updateRec: (id: string, patch: Partial<Omit<Rec, "id">>) => void;
  toggleRecDone: (id: string) => void;
  removeRec: (id: string) => void;
  addShow: (input: {
    title: string;
    years?: string;
    note?: string;
    status: Status;
    seasons?: number[];
    kind?: "show" | "movie";
    service?: string;
  }) => void;
  /** The chosen service, or Stremio when nobody has said. */
  serviceFor: (showId: string) => { id: string; chosen: boolean };
  setService: (showId: string, service: string) => void;
  setStatus: (id: string, status: Status) => void;
  removeShow: (id: string) => void;
  setPlan: (plan: Plan) => void;
  clearPlan: (date: string) => void;
  exportJson: () => string;
  resetAll: () => void;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const local = load();
    setState(local);
    setReady(true);

    if (!syncConfigured()) return;

    // Pull once on open, then keep listening. A remote change is merged into
    // what this browser has rather than replacing it outright.
    let cancelled = false;
    pullState().then((remote) => {
      if (cancelled || !remote) return;
      const merged = mergeState(local as unknown as Record<string, unknown>, remote.state);
      setState(merged as unknown as Persisted);
      save(merged as unknown as Persisted);
    });

    const unsubscribe = subscribe((incoming) => {
      setState((prev) => {
        const merged = mergeState(
          prev as unknown as Record<string, unknown>,
          incoming,
        ) as unknown as Persisted;
        save(merged);
        return merged;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const update = useCallback((fn: (prev: Persisted) => Persisted) => {
    setState((prev) => {
      const next = fn(prev);
      save(next);
      // Only local edits push; applying a remote change must not echo back.
      pushState(next as unknown as Record<string, unknown>);
      return next;
    });
  }, []);

  const shows = useMemo<LibraryShow[]>(() => {
    // Real episode data, where the build managed to fetch it, replaces the
    // approximate counts and the hand listed two-parters.
    const withData = (show: LibraryShow): LibraryShow => {
      const data = generatedShow(show.id);
      if (!data?.seasons.length) return show;
      const merged = [...(show.parts ?? [])];
      for (const group of data.parts) {
        const already = merged.some(
          (g) => g.season === group.season && g.episodes[0] === group.episodes[0],
        );
        if (!already) merged.push(group);
      }
      return { ...show, seasons: data.seasons, parts: merged };
    };

    const seed: LibraryShow[] = [
      ...WATCHED.map((s) => ({ ...s, status: "watched" as Status, custom: false })),
      ...WATCHLIST.map((s) => ({ ...s, status: "watchlist" as Status, custom: false })),
    ];
    const custom: LibraryShow[] = state.customShows.map((s) => ({ ...s, custom: true }));
    return [...seed, ...custom]
      .filter((s) => !state.removedIds.includes(s.id))
      .map((s) => ({ ...s, status: state.statusOverrides[s.id] ?? s.status }))
      .map(withData);
  }, [state]);

  const recs = useMemo<LibraryRec[]>(() => {
    const seed: LibraryRec[] = RECOMMENDATIONS.map((r) => ({ ...r, custom: false }));
    const custom: LibraryRec[] = state.customRecs.map((r) => ({ ...r, custom: true }));
    return [...seed, ...custom]
      .filter((r) => !state.removedRecIds.includes(r.id))
      .filter((r) => (r.kind as string) !== "book")
      .map((r) => ({
        ...r,
        ...state.recEdits[r.id],
        done: state.recDone[r.id] ?? r.done ?? false,
      }));
  }, [state]);

  const books = useMemo<LibraryBook[]>(() => {
    const seed: LibraryBook[] = BOOKS.map((b) => ({ ...b, custom: false }));
    const custom: LibraryBook[] = state.customBooks.map((b) => ({ ...b, custom: true }));
    return [...seed, ...custom]
      .filter((b) => !state.removedBookIds.includes(b.id))
      .map((b) => ({ ...b, ...state.bookEdits[b.id] }));
  }, [state]);

  const value = useMemo<Ctx>(() => {
    const byId = (id: string) => shows.find((s) => s.id === id);

    return {
      ready,
      synced: syncConfigured(),
      shows,
      watched: shows.filter((s) => s.status === "watched"),
      watchlist: shows.filter((s) => s.status === "watchlist"),
      plans: [...state.plans].sort((a, b) => a.date.localeCompare(b.date)),
      profiles: DEFAULT_PROFILES,
      activeProfile: DEFAULT_PROFILES.find((p) => p.id === state.activeProfileId) ?? null,
      entries: [...state.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      byId,
      setActiveProfile: (id) => update((prev) => ({ ...prev, activeProfileId: id })),
      addEntry: (entry) =>
        update((prev) => {
          if (!prev.activeProfileId) return prev;
          const record: LogEntry = {
            ...entry,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            profileId: prev.activeProfileId,
            createdAt: new Date().toISOString(),
          };
          return { ...prev, entries: [record, ...prev.entries] };
        }),
      removeEntry: (id) =>
        update((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.id !== id) })),
      showRatings: state.showRatings,
      episodeRatings: state.episodeRatings,
      setShowRating: (showId, rating) =>
        update((prev) => {
          const next = { ...prev.showRatings };
          // Clicking the star you already gave clears the rating.
          if (rating <= 0) delete next[showId];
          else next[showId] = rating;
          return { ...prev, showRatings: next };
        }),
      setEpisodeRating: (showId, season, episode, rating) =>
        update((prev) => {
          const key = `${showId}:${season}:${episode}`;
          const next = { ...prev.episodeRatings };
          if (rating <= 0) delete next[key];
          else next[key] = rating;
          return { ...prev, episodeRatings: next };
        }),
      showRating: (showId) => state.showRatings[showId] ?? 0,
      episodeRating: (showId, season, episode) =>
        state.episodeRatings[`${showId}:${season}:${episode}`] ?? 0,
      books,
      addBook: (book) =>
        update((prev) => {
          const title = book.title.trim();
          if (!title) return prev;
          const taken = new Set([
            ...BOOKS.map((b) => b.id),
            ...prev.customBooks.map((b) => b.id),
          ]);
          let id = `book-${slugify(title)}`;
          let n = 2;
          while (taken.has(id)) id = `book-${slugify(title)}-${n++}`;
          return {
            ...prev,
            customBooks: [
              ...prev.customBooks,
              { ...book, title, id, color: PALETTE[taken.size % PALETTE.length] },
            ],
          };
        }),
      updateBook: (id, patch) =>
        update((prev) => {
          if (prev.customBooks.some((b) => b.id === id)) {
            return {
              ...prev,
              customBooks: prev.customBooks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
            };
          }
          return {
            ...prev,
            bookEdits: { ...prev.bookEdits, [id]: { ...prev.bookEdits[id], ...patch } },
          };
        }),
      removeBook: (id) =>
        update((prev) => ({
          ...prev,
          customBooks: prev.customBooks.filter((b) => b.id !== id),
          removedBookIds: prev.removedBookIds.includes(id)
            ? prev.removedBookIds
            : [...prev.removedBookIds, id],
          bookEdits: Object.fromEntries(
            Object.entries(prev.bookEdits).filter(([key]) => key !== id),
          ),
        })),
      recs,
      addRec: (rec) =>
        update((prev) => {
          const title = rec.title.trim();
          if (!title) return prev;
          const taken = new Set([
            ...RECOMMENDATIONS.map((r) => r.id),
            ...prev.customRecs.map((r) => r.id),
          ]);
          let id = `rec-${slugify(title)}`;
          let n = 2;
          while (taken.has(id)) id = `rec-${slugify(title)}-${n++}`;

          const linked = linkRecToLibrary(prev, { ...rec, title, id }, SEED_SHOWS);
          return {
            ...prev,
            customRecs: [...prev.customRecs, linked.rec],
            customShows: linked.customShows,
          };
        }),
      updateRec: (id, patch) =>
        update((prev) => {
          // A custom one is edited in place; a seeded one gets an overlay so
          // data/content.ts stays the original.
          const current = recs.find((r) => r.id === id);
          const merged = current ? ({ ...current, ...patch } as Rec) : undefined;
          const linked = merged
            ? linkRecToLibrary(prev, merged, SEED_SHOWS)
            : { rec: undefined, customShows: prev.customShows };
          const withLink = linked.rec?.showId ? { showId: linked.rec.showId } : {};

          if (prev.customRecs.some((r) => r.id === id)) {
            return {
              ...prev,
              customShows: linked.customShows,
              customRecs: prev.customRecs.map((r) =>
                r.id === id ? { ...r, ...patch, ...withLink } : r,
              ),
            };
          }
          return {
            ...prev,
            customShows: linked.customShows,
            recEdits: {
              ...prev.recEdits,
              [id]: { ...prev.recEdits[id], ...patch, ...withLink },
            },
          };
        }),
      toggleRecDone: (id) =>
        update((prev) => ({
          ...prev,
          recDone: {
            ...prev.recDone,
            [id]: !(prev.recDone[id] ?? recs.find((r) => r.id === id)?.done ?? false),
          },
        })),
      removeRec: (id) =>
        update((prev) => ({
          ...prev,
          customRecs: prev.customRecs.filter((r) => r.id !== id),
          removedRecIds: prev.removedRecIds.includes(id)
            ? prev.removedRecIds
            : [...prev.removedRecIds, id],
          recEdits: Object.fromEntries(
            Object.entries(prev.recEdits).filter(([key]) => key !== id),
          ),
        })),
      entriesForShow: (showId) =>
        state.entries
          .filter((e) => e.showId === showId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      serviceFor: (showId) => {
        const stored = state.services[showId] ?? shows.find((s) => s.id === showId)?.service;
        // A service we've since dropped from the list counts as unset.
        const chosen = isKnownService(stored) ? stored : undefined;
        return { id: chosen ?? DEFAULT_SERVICE, chosen: Boolean(chosen) };
      },
      setService: (showId, service) =>
        update((prev) => {
          const next = { ...prev.services };
          if (!service) delete next[showId];
          else next[showId] = service;
          return { ...prev, services: next };
        }),
      addShow: ({ title, years, note, status, seasons, kind, service }) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        update((prev) => {
          const taken = new Set([
            ...shows.map((s) => s.id),
            ...prev.customShows.map((s) => s.id),
          ]);
          let id = slugify(trimmed);
          let n = 2;
          while (taken.has(id)) id = `${slugify(trimmed)}-${n++}`;
          const show: Show & { status: Status } = {
            id,
            title: trimmed,
            years: years?.trim() || "",
            initials: initialsFor(trimmed),
            color: PALETTE[taken.size % PALETTE.length],
            note: note?.trim() || "",
            status,
            ...(kind ? { kind } : {}),
            ...(service ? { service } : {}),
            ...(seasons && seasons.length ? { seasons } : {}),
            ...(status === "watched" && seasons?.length
              ? { progress: { seasonsWatched: seasons.length, seasonsTotal: seasons.length } }
              : {}),
          };
          return { ...prev, customShows: [...prev.customShows, show] };
        });
      },
      setStatus: (id, status) =>
        update((prev) => ({
          ...prev,
          statusOverrides: { ...prev.statusOverrides, [id]: status },
        })),
      removeShow: (id) =>
        update((prev) => ({
          ...prev,
          customShows: prev.customShows.filter((s) => s.id !== id),
          removedIds: prev.removedIds.includes(id)
            ? prev.removedIds
            : [...prev.removedIds, id],
          plans: prev.plans.filter((p) => p.showId !== id),
          entries: prev.entries.filter((e) => e.showId !== id),
          services: Object.fromEntries(
            Object.entries(prev.services).filter(([key]) => key !== id),
          ),
          showRatings: Object.fromEntries(
            Object.entries(prev.showRatings).filter(([key]) => key !== id),
          ),
          episodeRatings: Object.fromEntries(
            Object.entries(prev.episodeRatings).filter(([key]) => !key.startsWith(`${id}:`)),
          ),
        })),
      setPlan: (plan) =>
        update((prev) => ({
          ...prev,
          plans: [...prev.plans.filter((p) => p.date !== plan.date), plan],
        })),
      clearPlan: (date) =>
        update((prev) => ({ ...prev, plans: prev.plans.filter((p) => p.date !== date) })),
      exportJson: () => JSON.stringify(state, null, 2),
      resetAll: () => update(() => EMPTY),
    };
  }, [ready, shows, recs, books, state, update]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
