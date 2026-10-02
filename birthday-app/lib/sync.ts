"use client";

import { ROOM, supabase, syncConfigured } from "@/lib/supabase";

/**
 * Keeps one shared blob of state in Supabase so both of us see the same log,
 * ratings and schedule on every device.
 *
 * The whole persisted object is stored as one row rather than a table per
 * concept. For two people logging episodes that is plenty, and it means the
 * browser stays the source of truth for the shape of the data: the schema
 * never has to change when the app does.
 *
 * Conflicts resolve last write wins at the row level. Lists keyed by id are
 * merged on the way in so a note written on one phone is not erased by a
 * rating made on the other a moment later, but two simultaneous edits to the
 * same field will still end with one of them.
 */

const TABLE = "app_state";
const PUSH_DELAY = 800;

type Blob = Record<string, unknown>;

export type RemoteState = { state: Blob; updatedAt: string };

export async function pullState(): Promise<RemoteState | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db
    .from(TABLE)
    .select("state, updated_at")
    .eq("room", ROOM)
    .maybeSingle();

  if (error || !data) return null;
  return { state: (data.state ?? {}) as Blob, updatedAt: data.updated_at as string };
}

let timer: number | undefined;
let pending: Blob | null = null;

/** Debounced so a flurry of clicks is one write. */
export function pushState(state: Blob) {
  if (!syncConfigured()) return;
  pending = state;

  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    const db = supabase();
    const payload = pending;
    pending = null;
    if (!db || !payload) return;

    await db
      .from(TABLE)
      .upsert({ room: ROOM, state: payload, updated_at: new Date().toISOString() }, {
        onConflict: "room",
      });
  }, PUSH_DELAY);
}

/** Calls back whenever the other device writes. */
export function subscribe(onRemote: (state: Blob) => void) {
  const db = supabase();
  if (!db) return () => {};

  const channel = db
    .channel(`app_state:${ROOM}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `room=eq.${ROOM}` },
      (payload) => {
        const next = (payload.new as { state?: Blob } | null)?.state;
        if (next) onRemote(next);
      },
    )
    .subscribe();

  return () => {
    db.removeChannel(channel);
  };
}

/** Union two lists of objects by id, keeping whichever side has the entry. */
function mergeById<T extends { id: string }>(mine: T[] = [], theirs: T[] = []): T[] {
  const out = new Map<string, T>();
  for (const item of theirs) out.set(item.id, item);
  for (const item of mine) out.set(item.id, item);
  return [...out.values()];
}

/**
 * Remote wins on the plain fields, but anything list shaped is unioned so a
 * device that has been offline contributes rather than overwrites.
 */
export function mergeState(local: Blob, remote: Blob): Blob {
  const merged: Blob = { ...local, ...remote };

  for (const key of ["entries", "customShows", "customRecs", "customBooks", "plans"] as const) {
    merged[key] = mergeById(
      (local[key] ?? []) as { id: string }[],
      (remote[key] ?? []) as { id: string }[],
    );
  }

  // Plans are keyed by date rather than id.
  const plans = new Map<string, { date: string }>();
  for (const plan of (remote.plans ?? []) as { date: string }[]) plans.set(plan.date, plan);
  for (const plan of (local.plans ?? []) as { date: string }[]) plans.set(plan.date, plan);
  merged.plans = [...plans.values()];

  for (const key of ["removedIds", "removedRecIds", "removedBookIds"] as const) {
    merged[key] = [
      ...new Set([...((local[key] ?? []) as string[]), ...((remote[key] ?? []) as string[])]),
    ];
  }

  return merged;
}

export { syncConfigured };
