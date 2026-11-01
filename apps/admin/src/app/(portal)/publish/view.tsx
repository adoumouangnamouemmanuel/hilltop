"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Download, History, Loader2, Rocket, RotateCcw, Upload } from "lucide-react";
import { diffConfig, parseConfig, percent, platformConfigSchema, type PlatformConfig } from "@hilltop/shared/config";
import { RelativeTime } from "@hilltop/ui/controls";
import { toast } from "@hilltop/ui/toast";
import { Avatar, buttonClass, cn } from "@hilltop/ui/ui";
import { supabase } from "@/lib/supabase";
import type { Json } from "@hilltop/shared/database.types";
import { Badge, Card, CardHeader, Confirm, EmptyState, Gate, PageHeader, TextInput } from "@/components/kit";
import { discardDraft, editDraft, recordPublish } from "@/lib/model";
import { perform, useAdmin, useCan, usePublished, useSession } from "@/lib/store";
import type { Release } from "@/lib/release";

export function PublishView() {
  return (
    <Gate permission="settings.view">
      <PublishInner />
    </Gate>
  );
}

const at = (obj: unknown, path: string) =>
  path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

/** A short, readable rendering of a config value for the diff. */
function show(v: unknown, path = ""): string {
  if (typeof v === "number" && /(Rate|Ratio)$/.test(path)) return percent(v);
  if (v === undefined || v === null || v === "") return "empty";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}...` : v;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== "object")) return v.length ? v.join(", ") : "none";
    const labels = v.map((x) => (x && typeof x === "object" && "label" in x ? String(x.label) : null)).filter(Boolean);
    return labels.length ? labels.join(", ") : `${v.length} items`;
  }
  return `${Object.keys(v as object).length} settings`;
}

const humanize = (path: string) =>
  path
    .split(".")
    .map((p) => (/^\d+$/.test(p) ? `#${Number(p) + 1}` : p.replace(/([A-Z])/g, " $1").toLowerCase()))
    .join(" › ");

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

function PublishInner() {
  const s = useAdmin();
  const { member } = useSession();
  const { config: live, releases, refresh } = usePublished();
  const canPublish = useCan("settings.publish");
  const canEdit = useCan("settings.edit");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [discarding, setDiscarding] = useState(false);
  const [restoring, setRestoring] = useState<Release | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const draft = s.draft;
  const changes = useMemo(() => (draft ? diffConfig(live, draft) : []), [draft, live]);
  const invalid = useMemo(() => {
    if (!draft) return [];
    const r = platformConfigSchema.safeParse(draft);
    return r.success ? [] : r.error.issues.map((i) => `${humanize(i.path.join("."))}: ${i.message}`);
  }, [draft]);
  const latest = releases[0];

  function publish() {
    if (!draft || !member) return;
    setIssues([]);
    startTransition(async () => {
      const client = supabase();
      if (!client) return;
      // The database checks the publish permission and numbers the release.
      const { data, error } = await client
        .from("config_releases")
        .insert({ config: draft as unknown as { [key: string]: Json }, note: note.trim(), changes })
        .select("version")
        .single();
      if (error || !data) {
        toast(error?.code === "42501" ? "You don't have permission to publish." : "Publishing failed. Try again.");
        return;
      }
      perform((st, now) => recordPublish(st, data.version, note.trim(), now), `Version ${data.version} is live`);
      setNote("");
      await refresh();
    });
  }

  function loadIntoDraft(config: PlatformConfig, action: string, success: string) {
    perform((st, now) => editDraft(st, live, "settings.edit", action, () => config, now), success);
  }

  async function importFile(file: File) {
    try {
      const { config, issues } = parseConfig(JSON.parse(await file.text()));
      if (issues.length) {
        setIssues(issues);
        toast("That file isn't a valid config.");
        return;
      }
      loadIntoDraft(config, `Imported config from ${file.name}`, "Imported into the draft. Review and publish.");
    } catch {
      toast("Couldn't read that file. Use a JSON export from this portal.");
    }
  }

  return (
    <>
      <PageHeader
        title="Publish"
        description="Review what changed, then make it live. The marketplace picks up a new version within a minute, and you can roll back anytime."
      >
        <button
          type="button"
          onClick={() => download(`hilltop-config-${draft ? "draft" : `v${latest?.version ?? 1}`}.json`, draft ?? live)}
          className={buttonClass("outline", "sm")}
        >
          <Download className="size-4" aria-hidden />
          Export
        </button>
        {canEdit && (
          <>
            <button type="button" onClick={() => fileInput.current?.click()} className={buttonClass("outline", "sm")}>
              <Upload className="size-4" aria-hidden />
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={draft ? `${changes.length} unpublished change${changes.length === 1 ? "" : "s"}` : "Everything is live"}
              description={
                draft
                  ? "Saved by your team, not visible to students yet."
                  : "There are no draft changes. Edit settings or the catalog to start one."
              }
            >
              {draft && canEdit && (
                <button type="button" onClick={() => setDiscarding(true)} className={buttonClass("ghost", "sm")}>
                  Discard
                </button>
              )}
            </CardHeader>
            {draft ? (
              <ul className="max-h-[480px] divide-y divide-line overflow-y-auto">
                {changes.map((path, i) => (
                  <motion.li
                    key={path}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.03 }}
                    className="px-5 py-3"
                  >
                    <p className="text-xs font-medium text-ink-500 capitalize">{humanize(path)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="rounded-md bg-maroon-50 px-1.5 py-0.5 text-maroon-700 line-through decoration-maroon-700/40">
                        {show(at(live, path), path)}
                      </span>
                      <ArrowRight className="size-3.5 text-ink-400" aria-hidden />
                      <span className="rounded-md bg-success-bg px-1.5 py-0.5 font-medium text-success">{show(at(draft, path), path)}</span>
                    </div>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing to publish"
                body={latest ? `Version ${latest.version} is live.` : "The marketplace is running on the built-in defaults."}
              />
            )}
          </Card>

          {draft && (
            <Card className="p-5">
              {[...invalid, ...issues].length > 0 && (
                <div className="mb-4 rounded-xl bg-warning-bg p-3 text-[13px] text-warning">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4" aria-hidden />
                    Fix these before publishing
                  </p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                    {[...new Set([...invalid, ...issues])].slice(0, 8).map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label htmlFor="note" className="text-[13px] font-medium text-ink-900">
                Release note
              </label>
              <TextInput
                id="note"
                value={note}
                maxLength={280}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What changed and why, e.g. Lower protection fee for exams week"
                className="mt-1.5"
              />
              <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink-500">
                  {canPublish
                    ? "Publishing is recorded in the audit log."
                    : "You can save drafts, but publishing needs the settings.publish permission."}
                </p>
                <button
                  type="button"
                  onClick={publish}
                  disabled={!canPublish || pending || invalid.length > 0}
                  className={buttonClass("primary", "md")}
                >
                  {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
                  Publish version {(latest?.version ?? 1) + 1}
                </button>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Release history" description="Restore an older version into the draft, then publish it to roll back." />
            {releases.length === 0 ? (
              <EmptyState icon={History} title="No releases yet" body="The marketplace uses the defaults until the first publish." />
            ) : (
              <ol className="divide-y divide-line">
                {releases.map((r, i) => (
                  <li key={r.version} className="flex items-start gap-3 px-5 py-3.5">
                    <Avatar name={r.by} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-ink-950">
                        Version {r.version}
                        {i === 0 && (
                          <Badge tone="success" dot>
                            Live
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {r.by} · <RelativeTime at={new Date(r.publishedAt).getTime()} /> · {r.changes.length} change
                        {r.changes.length === 1 ? "" : "s"}
                      </p>
                      {r.note && <p className="mt-1 text-[13px] text-ink-700">{r.note}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => download(`hilltop-config-v${r.version}.json`, r.config)}
                        aria-label={`Download version ${r.version}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-surface hover:text-ink-950"
                      >
                        <Download className="size-4" aria-hidden />
                      </button>
                      {i > 0 && canEdit && (
                        <button
                          type="button"
                          onClick={() => setRestoring(r)}
                          aria-label={`Restore version ${r.version}`}
                          className={cn("grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-surface hover:text-ink-950")}
                        >
                          <RotateCcw className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <Confirm
        open={discarding}
        onClose={() => setDiscarding(false)}
        danger
        title="Discard unpublished changes?"
        body={`All ${changes.length} draft changes are thrown away for the whole team. What's live doesn't change.`}
        confirmLabel="Discard changes"
        onConfirm={() => perform((st, now) => discardDraft(st, now), "Draft discarded")}
      />
      <Confirm
        open={!!restoring}
        onClose={() => setRestoring(null)}
        title={`Restore version ${restoring?.version}?`}
        body="It replaces the current draft. Review the changes here, then publish to roll the marketplace back."
        confirmLabel="Restore into draft"
        onConfirm={() =>
          restoring &&
          loadIntoDraft(
            restoring.config,
            `Restored version ${restoring.version} into draft`,
            `Version ${restoring.version} restored into the draft`,
          )
        }
      />
    </>
  );
}
