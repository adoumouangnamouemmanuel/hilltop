import { z } from "zod";
import { supabase } from "./supabase";

export const historyCursorSchema = z.object({ at: z.string().datetime({ offset: true }), id: z.string().min(1).max(80) });
export type HistoryCursor = z.infer<typeof historyCursorSchema>;
export type CursorPage<T> = { items: T[]; next: HistoryCursor | null };
export type HistoryKind = "conversations" | "messages" | "notifications" | "offers" | "incoming" | "orders" | "dispute_messages";

export async function accountPage<T>(
  kind: HistoryKind,
  schema: z.ZodType<T>,
  cursor: HistoryCursor | null,
  limit: number,
  parent?: string,
): Promise<CursorPage<T>> {
  const client = supabase();
  if (!client) throw new Error("Connect to load your history.");
  const { data, error } = await client.rpc("account_page", { p_kind: kind, p_cursor: cursor, p_limit: limit, p_parent: parent });
  if (error) throw new Error("Couldn't load this page. Check your connection and retry.");
  return z.object({ items: z.array(schema), next: historyCursorSchema.nullable() }).parse(data);
}

/** Refresh only pages the user has opened. Account changes invalidate in-flight results. */
export function cursorPager<T extends { id: string }>(fetchPage: (cursor: HistoryCursor | null) => Promise<CursorPage<T>>) {
  let owner: string | null = null;
  let pages = 1;
  let generation = 0;
  let snapshot: CursorPage<T> = { items: [], next: null };
  let running: Promise<CursorPage<T>> | null = null;
  function reset() {
    owner = null;
    pages = 1;
    generation++;
    snapshot = { items: [], next: null };
    running = null;
  }
  async function read(profileId: string, more = false): Promise<CursorPage<T>> {
    if (owner !== profileId) {
      reset();
      owner = profileId;
    }
    if (running) {
      await running;
      if (owner !== profileId) return { items: [], next: null };
    }
    const ticket = generation;
    const work = async () => {
      if (more && !snapshot.next) return snapshot;
      const wanted = more ? pages + 1 : pages;
      let cursor: HistoryCursor | null = more ? snapshot.next : null;
      const rows = new Map<string, T>(more ? snapshot.items.map((row) => [row.id, row]) : []);
      let readPages = more ? pages : 0;
      do {
        const page = await fetchPage(cursor);
        if (ticket !== generation) return { items: [], next: null };
        page.items.forEach((row) => rows.set(row.id, row));
        cursor = page.next;
        readPages++;
      } while (cursor && readPages < wanted);
      if (ticket === generation) {
        pages = readPages;
        snapshot = { items: [...rows.values()], next: cursor };
      }
      return snapshot;
    };
    const promise = work();
    running = promise;
    try {
      return await promise;
    } finally {
      if (running === promise) running = null;
    }
  }
  return { read, reset, snapshot: () => snapshot };
}
