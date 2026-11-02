"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { buttonClass } from "@hilltop/ui/ui";
import { toast } from "@hilltop/ui/toast";
import { Badge, Card, EmptyState, Gate, PageHeader, Segmented, type Tone } from "@/components/kit";
import { supabase } from "@/lib/supabase";
import { useQueryState } from "@/lib/use-query";

/*
 * Feedback and bug reports sent from the marketplace's Feedback button. Loaded a
 * page at a time from the database, newest first; marking one seen or closed is
 * saved straight away.
 */

type Status = "new" | "seen" | "closed";
type Entry = {
  id: string;
  kind: "bug" | "idea" | "other";
  message: string;
  page: string | null;
  device: string | null;
  status: Status;
  created_at: string;
  sender: { name: string; handle: string } | null;
};

const PAGE = 50;
const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const kindLabel: Record<Entry["kind"], { label: string; tone: Tone }> = {
  bug: { label: "Bug", tone: "maroon" },
  idea: { label: "Idea", tone: "success" },
  other: { label: "Other", tone: "neutral" },
};

export function FeedbackView() {
  return (
    <Gate permission="feedback.view">
      <FeedbackInner />
    </Gate>
  );
}

function FeedbackInner() {
  const [filter, setFilter] = useQueryState<"open" | "closed">("show", "open");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(
    async (from: number) => {
      const client = supabase();
      if (!client) return null;
      let query = client
        .from("feedback")
        .select("id, kind, message, page, device, status, created_at, sender:profiles!feedback_profile_id_fkey(name, handle)")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      query = filter === "closed" ? query.eq("status", "closed") : query.neq("status", "closed");
      const { data, error } = await query;
      if (error) {
        toast("Couldn't load feedback. Try again.");
        return null;
      }
      return (data ?? []) as unknown as Entry[];
    },
    [filter],
  );

  const show = useCallback((rows: Entry[] | null, from: number) => {
    setLoading(false);
    if (!rows) return;
    setEntries((prev) => (from === 0 ? rows : [...prev, ...rows]));
    setMore(rows.length === PAGE);
  }, []);

  useEffect(() => {
    let live = true;
    fetchPage(0).then((rows) => live && show(rows, 0));
    return () => {
      live = false;
    };
  }, [fetchPage, show]);

  async function loadMore() {
    setLoading(true);
    show(await fetchPage(entries.length), entries.length);
  }

  async function setStatus(entry: Entry, status: Status) {
    const { error } = (await supabase()?.from("feedback").update({ status }).eq("id", entry.id)) ?? {};
    if (error) return toast("Couldn't update it. Try again.");
    setEntries((list) =>
      list.flatMap((e) => (e.id !== entry.id ? [e] : (status === "closed") !== (filter === "closed") ? [] : [{ ...e, status }])),
    );
  }

  return (
    <>
      <PageHeader title="Feedback" description="Bug reports and ideas from students and visitors, sent with the Feedback button." />
      <Segmented
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { id: "open", label: "Open" },
          { id: "closed", label: "Closed" },
        ]}
        className="mb-4 w-fit"
      />
      <Card>
        {entries.length === 0 && !loading ? (
          <EmptyState icon={MessageSquareWarning} title={filter === "open" ? "Nothing waiting" : "Nothing closed yet"} />
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    <Badge tone={kindLabel[e.kind].tone}>{kindLabel[e.kind].label}</Badge>
                    {e.status === "new" && <Badge tone="warning">New</Badge>}
                    <span>{when.format(new Date(e.created_at))}</span>
                    <span>· {e.sender ? e.sender.name : "A visitor"}</span>
                    {e.page && <span className="font-mono">· {e.page}</span>}
                  </div>
                  <p className="mt-2 text-sm leading-6 break-words whitespace-pre-line text-ink-950">{e.message}</p>
                  {e.device && <p className="mt-1 truncate text-xs text-ink-400">{e.device}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {e.status === "new" && (
                    <button type="button" className={buttonClass("outline", "sm")} onClick={() => setStatus(e, "seen")}>
                      Mark seen
                    </button>
                  )}
                  <button
                    type="button"
                    className={buttonClass(e.status === "closed" ? "outline" : "dark", "sm")}
                    onClick={() => setStatus(e, e.status === "closed" ? "seen" : "closed")}
                  >
                    {e.status === "closed" ? "Reopen" : "Close"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {more && (
          <div className="border-t border-line p-4 text-center">
            <button type="button" disabled={loading} className={buttonClass("ghost", "sm")} onClick={loadMore}>
              Load more
            </button>
          </div>
        )}
      </Card>
    </>
  );
}
