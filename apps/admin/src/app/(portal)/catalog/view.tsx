"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronLeft, FolderTree, Plus, Trash2 } from "lucide-react";
import { categorySchema, deepEqual, type PlatformConfig } from "@hilltop/shared/config";
import type { AttributeDef, CategoryDef } from "@hilltop/shared/catalog";
import { CategoryIcon, categoryIconNames } from "@hilltop/ui/category-icon";
import { Switch } from "@hilltop/ui/controls";
import { buttonClass, cn } from "@hilltop/ui/ui";
import {
  AddButton,
  Badge,
  Card,
  CardHeader,
  Confirm,
  EmptyState,
  Field,
  Gate,
  PageHeader,
  Select,
  TagList,
  TextInput,
} from "@/components/kit";
import { editDraft } from "@/lib/model";
import { perform, useAdmin, useCan, usePublished, useWorkingConfig } from "@/lib/store";
import { useQueryState } from "@/lib/use-query";

const attrTypes: Record<AttributeDef["type"], string> = { select: "Choice list", text: "Text", number: "Number", boolean: "Yes or no" };

export function CatalogView() {
  return (
    <Gate permission="catalog.view">
      <CatalogInner />
    </Gate>
  );
}

function useCatalogEdit() {
  const { config: published } = usePublished();
  return (action: string, update: (cats: CategoryDef[]) => CategoryDef[], success?: string) =>
    perform(
      (s, now) => editDraft(s, published, "catalog.edit", action, (c: PlatformConfig) => ({ ...c, categories: update(c.categories) }), now),
      success,
    );
}

function CatalogInner() {
  const config = useWorkingConfig();
  const { config: published } = usePublished();
  const s = useAdmin();
  const canEdit = useCan("catalog.edit");
  const edit = useCatalogEdit();
  const [selected, setSelected] = useQueryState<string>("id", "");
  const [creating, setCreating] = useState(false);

  const cats = config.categories;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of s.listings) if (l.state === "live") m.set(l.category, (m.get(l.category) ?? 0) + 1);
    return m;
  }, [s.listings]);
  const current = creating ? null : (cats.find((c) => c.id === selected) ?? null);
  const changed = (c: CategoryDef) =>
    !deepEqual(
      published.categories.find((p) => p.id === c.id),
      c,
    );

  const move = (id: string, dir: -1 | 1) =>
    edit("Reordered categories", (list) => {
      const i = list.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const showEditor = creating || !!current;

  return (
    <>
      <PageHeader
        title="Catalog"
        description="Categories and the details sellers fill in for each. Filters, listing pages and the sell form are all built from this."
      >
        {canEdit && (
          <button
            type="button"
            className={buttonClass("dark", "sm")}
            onClick={() => {
              setCreating(true);
              setSelected("");
            }}
          >
            <Plus className="size-4" aria-hidden />
            New category
          </button>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className={cn(showEditor && "hidden lg:block")}>
          <CardHeader
            title={`${cats.length} categories`}
            description={`${cats.filter((c) => c.enabled !== false).length} visible to students`}
          />
          <ul className="divide-y divide-line">
            {cats.map((c, i) => (
              <motion.li key={c.id} layout transition={{ type: "spring", stiffness: 500, damping: 40 }} className="bg-elevated">
                <div className={cn("group flex items-center gap-2 px-3 py-2.5", current?.id === c.id && "bg-surface")}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setSelected(c.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-ink-700",
                        c.enabled === false && "opacity-40",
                      )}
                    >
                      <CategoryIcon name={c.icon} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn("block truncate text-[13.5px] font-medium", c.enabled === false ? "text-ink-400" : "text-ink-950")}
                      >
                        {c.label}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {c.attributes.length} fields · {counts.get(c.id) ?? 0} live listings
                      </span>
                    </span>
                    {changed(c) && <Badge tone="warning">Draft</Badge>}
                  </button>
                  {canEdit && (
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => move(c.id, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${c.label} up`}
                        className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-surface-2 hover:text-ink-950 disabled:opacity-30"
                      >
                        <ArrowUp className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(c.id, 1)}
                        disabled={i === cats.length - 1}
                        aria-label={`Move ${c.label} down`}
                        className="grid size-7 place-items-center rounded-md text-ink-400 hover:bg-surface-2 hover:text-ink-950 disabled:opacity-30"
                      >
                        <ArrowDown className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  )}
                  <Switch
                    label={`Show ${c.label}`}
                    checked={c.enabled !== false}
                    onChange={(v) =>
                      canEdit &&
                      edit(`${v ? "Showed" : "Hid"} category ${c.label}`, (list) =>
                        list.map((x) => (x.id === c.id ? { ...x, enabled: v } : x)),
                      )
                    }
                  />
                </div>
              </motion.li>
            ))}
          </ul>
        </Card>

        <div className={cn(!showEditor && "hidden lg:block")}>
          <AnimatePresence mode="wait">
            {showEditor ? (
              <motion.div
                key={creating ? "new" : current?.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setSelected("");
                  }}
                  className="mb-3 flex items-center gap-1 text-[13px] font-medium text-ink-700 lg:hidden"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  All categories
                </button>
                <CategoryEditor
                  initial={current ?? { id: "", label: "", icon: "Package", blurb: "", attributes: [], enabled: true }}
                  isNew={creating}
                  live={!!published.categories.find((p) => p.id === current?.id)}
                  listingCount={current ? (counts.get(current.id) ?? 0) : 0}
                  existingIds={cats.map((c) => c.id)}
                  onDone={(id) => {
                    setCreating(false);
                    setSelected(id ?? "");
                  }}
                />
              </motion.div>
            ) : (
              <Card>
                <EmptyState icon={FolderTree} title="Pick a category" body="Edit its name, icon and the fields sellers fill in." />
              </Card>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const camel = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, ch: string) => ch.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/^[0-9]+/, "");

function CategoryEditor({
  initial,
  isNew,
  live,
  listingCount,
  existingIds,
  onDone,
}: {
  initial: CategoryDef;
  isNew: boolean;
  live: boolean;
  listingCount: number;
  existingIds: string[];
  onDone: (id?: string) => void;
}) {
  const canEdit = useCan("catalog.edit");
  const edit = useCatalogEdit();
  const [cat, setCat] = useState<CategoryDef>(initial);
  const [deleting, setDeleting] = useState(false);
  const update = (patch: Partial<CategoryDef>) => setCat((c) => ({ ...c, ...patch }));
  const setAttr = (i: number, patch: Partial<AttributeDef>) =>
    update({ attributes: cat.attributes.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const errors = useMemo(() => {
    const out = new Map<string, string>();
    const r = categorySchema.safeParse(cat);
    if (!r.success) for (const i of r.error.issues) out.set(i.path.join("."), i.message);
    if (isNew && existingIds.includes(cat.id)) out.set("id", "Another category already uses this id.");
    const keys = cat.attributes.map((a) => a.key);
    keys.forEach((k, i) => keys.indexOf(k) !== i && out.set(`attributes.${i}.key`, "Each field needs its own key."));
    cat.attributes.forEach(
      (a, i) => a.type === "select" && !a.options?.length && out.set(`attributes.${i}.options`, "Add at least one choice."),
    );
    return out;
  }, [cat, isNew, existingIds]);

  const dirty = !deepEqual(cat, initial);

  function save() {
    const ok = edit(
      isNew ? `Created category ${cat.label}` : `Edited category ${cat.label}`,
      (list) => (isNew ? [...list, cat] : list.map((c) => (c.id === initial.id ? cat : c))),
      "Saved to draft. Publish to make it live.",
    );
    if (ok) onDone(cat.id);
  }

  return (
    <Card>
      <CardHeader
        title={isNew ? "New category" : initial.label}
        description={isNew ? "Students see it once it's published." : live ? `Live with ${listingCount} listings` : "Not published yet"}
      >
        {!isNew && canEdit && (
          <button type="button" onClick={() => setDeleting(true)} className={buttonClass("ghost", "sm", "text-maroon-700")}>
            <Trash2 className="size-4" aria-hidden />
            Delete
          </button>
        )}
      </CardHeader>
      <fieldset disabled={!canEdit} className="min-w-0 space-y-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.get("label")}>
            {(id) => (
              <TextInput
                id={id}
                value={cat.label}
                placeholder="e.g. Sports gear"
                onChange={(e) => update({ label: e.target.value, ...(isNew ? { id: slug(e.target.value) } : {}) })}
              />
            )}
          </Field>
          <Field
            label="Id"
            error={errors.get("id")}
            hint={isNew ? "Used in links. Can't change once created." : "Used in links and by existing listings."}
          >
            {(id) => <TextInput id={id} value={cat.id} disabled={!isNew} onChange={(e) => update({ id: slug(e.target.value) })} />}
          </Field>
          <Field label="Short description" className="sm:col-span-2" error={errors.get("blurb")}>
            {(id) => (
              <TextInput
                id={id}
                value={cat.blurb}
                maxLength={80}
                placeholder="e.g. Jerseys, rackets, gym gear"
                onChange={(e) => update({ blurb: e.target.value })}
              />
            )}
          </Field>
          <Field label="Cover image URL (optional)" className="sm:col-span-2">
            {(id) => (
              <TextInput
                id={id}
                value={cat.cover ?? ""}
                placeholder="https://images.unsplash.com/photo-..."
                onChange={(e) => update({ cover: e.target.value || undefined })}
              />
            )}
          </Field>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-900">Icon</p>
          <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1.5">
            {categoryIconNames.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={cat.icon === name}
                aria-label={name}
                onClick={() => update({ icon: name })}
                className={cn(
                  "grid size-10 place-items-center rounded-xl border transition-colors",
                  cat.icon === name ? "border-ink-950 bg-ink-950 text-canvas" : "border-line text-ink-700 hover:border-line-strong",
                )}
              >
                <CategoryIcon name={name} className="size-[18px]" />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-surface p-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[13.5px] font-medium text-ink-950">Visible to students</span>
              <span className="block text-xs text-ink-500">Hidden categories keep their listings but don’t show anywhere.</span>
            </span>
            <Switch label="Visible to students" checked={cat.enabled !== false} onChange={(v) => update({ enabled: v })} />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[13.5px] font-medium text-ink-950">No item condition</span>
              <span className="block text-xs text-ink-500">For things like food and tickets that aren’t new or used.</span>
            </span>
            <Switch label="No item condition" checked={!!cat.noCondition} onChange={(v) => update({ noCondition: v || undefined })} />
          </label>
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-ink-950">Fields</h3>
              <p className="text-xs text-ink-500">What sellers fill in. Fields marked as filters show up when browsing.</p>
            </div>
            <AddButton onClick={() => update({ attributes: [...cat.attributes, { key: "", label: "", type: "text" }] })}>
              Add field
            </AddButton>
          </div>
          {cat.attributes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-500">
              No fields yet. Sellers will only add a title, photos and a description.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {cat.attributes.map((a, i) => (
                <motion.li layout key={i} className="rounded-xl border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_150px_auto]">
                    <TextInput
                      aria-label="Field name"
                      placeholder="Name, e.g. Size"
                      value={a.label}
                      onChange={(e) =>
                        setAttr(i, { label: e.target.value, ...(a.key === camel(a.label) || !a.key ? { key: camel(e.target.value) } : {}) })
                      }
                      aria-invalid={errors.has(`attributes.${i}.label`)}
                    />
                    <TextInput
                      aria-label="Field key"
                      placeholder="key"
                      value={a.key}
                      onChange={(e) => setAttr(i, { key: e.target.value })}
                      aria-invalid={errors.has(`attributes.${i}.key`)}
                      className="font-mono text-[12.5px]"
                    />
                    <Select
                      aria-label="Field type"
                      value={a.type}
                      onChange={(e) =>
                        setAttr(i, {
                          type: e.target.value as AttributeDef["type"],
                          options: e.target.value === "select" ? (a.options ?? []) : undefined,
                        })
                      }
                    >
                      {Object.entries(attrTypes).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => update({ attributes: swap(cat.attributes, i, i - 1) })}
                        aria-label="Move field up"
                        className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-surface disabled:opacity-30"
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={i === cat.attributes.length - 1}
                        onClick={() => update({ attributes: swap(cat.attributes, i, i + 1) })}
                        aria-label="Move field down"
                        className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-surface disabled:opacity-30"
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ attributes: cat.attributes.filter((_, j) => j !== i) })}
                        aria-label={`Remove ${a.label || "field"}`}
                        className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-maroon-50 hover:text-maroon-700"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  {errors.get(`attributes.${i}.key`) && (
                    <p className="mt-1.5 text-xs text-maroon-700">{errors.get(`attributes.${i}.key`)}</p>
                  )}
                  {a.type === "select" && (
                    <div className="mt-2">
                      <TagList
                        label="Choices"
                        values={a.options ?? []}
                        onChange={(v) => setAttr(i, { options: v })}
                        placeholder="Add a choice and press Enter"
                      />
                      {errors.get(`attributes.${i}.options`) && (
                        <p className="mt-1.5 text-xs text-maroon-700">{errors.get(`attributes.${i}.options`)}</p>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                    {(a.type === "text" || a.type === "number") && (
                      <TextInput
                        aria-label="Placeholder"
                        placeholder="Hint, e.g. e.g. 14 inches"
                        value={a.placeholder ?? ""}
                        onChange={(e) => setAttr(i, { placeholder: e.target.value || undefined })}
                        className="h-9 max-w-xs"
                      />
                    )}
                    {a.type === "number" && (
                      <TextInput
                        aria-label="Unit"
                        placeholder="Unit, e.g. %"
                        value={a.unit ?? ""}
                        maxLength={8}
                        onChange={(e) => setAttr(i, { unit: e.target.value || undefined })}
                        className="h-9 w-28"
                      />
                    )}
                    {a.type !== "text" && (
                      <label className="flex items-center gap-2 text-[13px] text-ink-700">
                        <Switch label="Use as a filter" checked={!!a.filter} onChange={(v) => setAttr(i, { filter: v || undefined })} />
                        Use as a filter
                      </label>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>
      {canEdit && (
        <div className="flex items-center justify-between gap-3 border-t border-line p-4">
          <p className="text-xs text-ink-500">
            {errors.size ? `${errors.size} thing${errors.size > 1 ? "s" : ""} to fix` : dirty ? "Unsaved changes" : "No changes"}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => (isNew ? onDone() : setCat(initial))} className={buttonClass("ghost", "sm")}>
              {isNew ? "Cancel" : "Reset"}
            </button>
            <button type="button" onClick={save} disabled={!dirty || errors.size > 0} className={buttonClass("dark", "sm")}>
              {isNew ? "Create category" : "Save to draft"}
            </button>
          </div>
        </div>
      )}
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        danger
        title={`Delete ${initial.label}?`}
        body={
          listingCount
            ? `${listingCount} live listings use this category. They'll show under "Other" until sellers move them. Hiding the category is usually safer.`
            : "It's removed from the marketplace when you publish."
        }
        confirmLabel="Delete category"
        onConfirm={() =>
          edit(`Deleted category ${initial.label}`, (list) => list.filter((c) => c.id !== initial.id), "Category deleted from draft") &&
          onDone()
        }
      />
    </Card>
  );
}

function swap<T>(list: T[], i: number, j: number) {
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
