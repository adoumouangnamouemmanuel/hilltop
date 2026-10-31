"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { makeCustomCategory, type AttributeDef } from "@/lib/catalog";
import {
  BOOST_PLANS,
  conditions,
  listings,
  MOVE_OUT_SALE,
  pickupSpots,
  type AttrValue,
  type Condition,
  type Listing,
  type PickupSpot,
} from "@/lib/data";
import { formatCedi } from "@/lib/format";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useCatalog } from "@/lib/use-catalog";
import { CategoryIcon } from "@/components/category-icon";
import { buttonClass, cn } from "@/components/ui";

const MAX_PHOTOS = 8;
const newListingId = () => `my-${Date.now().toString(36)}`;
const TITLE_MAX = 70;

const conditionHelp: Record<Condition, string> = {
  New: "Unused, still in the packaging",
  "Like new": "Used once or twice, no marks",
  Good: "Some signs of use, works perfectly",
  Fair: "Visible wear, still fully usable",
};

const field =
  "w-full rounded-xl border border-line-strong bg-elevated px-4 text-[15px] text-ink-950 outline-none transition-colors placeholder:text-ink-400 hover:border-ink-400 focus:border-ink-950";

export function SellForm() {
  const router = useRouter();
  const { user, addListing, addCategory } = useStore();
  const catalog = useCatalog();
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [attrs, setAttrs] = useState<Record<string, AttrValue>>({});
  const [extra, setExtra] = useState<[string, string][]>([]);
  const [condition, setCondition] = useState<Condition | null>(null);
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");
  const [original, setOriginal] = useState("");
  const [description, setDescription] = useState("");
  const [pickup, setPickup] = useState<PickupSpot>(pickupSpots[0]);
  const [boost, setBoost] = useState<string>("none");
  const [moveOut, setMoveOut] = useState(false);
  const [status, setStatus] = useState<"idle" | "publishing" | "done">("idle");
  const [touched, setTouched] = useState(false);

  const category = categoryId ? catalog.get(categoryId) : null;
  const priceNum = Number(price) || 0;
  const originalNum = Number(original) || 0;

  // Price guidance from similar items in the same category.
  const guide = useMemo(() => {
    if (!categoryId) return null;
    const prices = listings
      .filter((l) => l.category === categoryId)
      .map((l) => l.price)
      .sort((a, b) => a - b);
    if (prices.length < 3) return null;
    return { low: prices[Math.floor(prices.length * 0.25)], high: prices[Math.floor(prices.length * 0.75)] };
  }, [categoryId]);

  const errors = {
    photos: photos.length === 0 && "Add at least one photo",
    title: title.trim().length < 4 && "Give your item a clear title",
    category: !category && "Pick a category",
    condition: category && !category.noCondition && !condition && "Pick a condition",
    price: priceNum <= 0 && "Set a price",
  };
  const firstError = Object.values(errors).find(Boolean);
  const plan = BOOST_PLANS.find((p) => p.id === boost);

  function pickCategory(id: string) {
    setCategoryId(id);
    // Values from another category's schema don't apply.
    setAttrs({});
  }

  function createCategory() {
    const label = newCategory?.trim();
    if (!label) return;
    const cat = makeCustomCategory(label);
    addCategory(cat);
    pickCategory(cat.id);
    setNewCategory(null);
    toast(`“${cat.label}” added as a new category`, { tone: "success" });
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length);
    const urls = await Promise.all(
      files.map(
        (f) =>
          new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.readAsDataURL(f);
          }),
      ),
    );
    setPhotos((p) => [...p, ...urls].slice(0, MAX_PHOTOS));
    e.target.value = "";
  }

  function publish(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (firstError || !category) return;
    setStatus("publishing");
    const cleanAttrs = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== ""));
    const listing: Listing = {
      id: newListingId(),
      title: title.trim(),
      price: priceNum,
      originalPrice: originalNum > priceNum ? originalNum : undefined,
      category: category.id,
      condition: category.noCondition ? undefined : (condition ?? undefined),
      attributes: cleanAttrs,
      extra: extra.filter(([k, v]) => k.trim() && v.trim()),
      stock: stock ? Number(stock) : undefined,
      pickup,
      description: description.trim() || "No description yet.",
      images: photos,
      sellerId: "me",
      postedDaysAgo: 0,
      promoted: boost !== "none",
      moveOut,
      saves: 0,
      views: 0,
    };
    setTimeout(() => {
      addListing(listing);
      setStatus("done");
      toast("Your listing is live", { tone: "success" });
      setTimeout(() => router.push(`/listing/${listing.id}`), 700);
    }, 700);
  }

  if (!user) {
    return (
      <div className="mt-8 max-w-lg rounded-2xl border border-line p-8">
        <h2 className="text-lg font-semibold text-ink-950">Log in to start selling</h2>
        <p className="mt-1.5 text-sm leading-6 text-ink-500">
          Only verified Ashesi students can list items. It&rsquo;s what makes buyers trust you.
        </p>
        <Link href="/sign-in?next=/sell" className={buttonClass("dark", "lg", "mt-6")}>
          Continue with Ashesi email
        </Link>
      </div>
    );
  }

  const show = (key: keyof typeof errors) => touched && errors[key];

  return (
    <form onSubmit={publish} noValidate className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
      <div className="divide-y divide-line">
        <Section title="Photos" hint={`${photos.length}/${MAX_PHOTOS}. Tap a photo to make it the cover.`} error={show("photos")}>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
            <AnimatePresence initial={false}>
              {photos.map((src, i) => (
                <motion.div
                  key={src.slice(-48) + i}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative aspect-square overflow-hidden rounded-xl bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => [p[i], ...p.filter((_, j) => j !== i)])}
                    className="absolute inset-0"
                    aria-label={`Make photo ${i + 1} the cover`}
                  >
                    <Image src={src} alt={`Photo ${i + 1}`} fill unoptimized className="object-cover" />
                  </button>
                  {i === 0 && (
                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#121010]">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {photos.length < MAX_PHOTOS && (
              <label className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-ink-500 transition-colors hover:border-ink-900 hover:text-ink-950">
                <ImagePlus className="size-5" aria-hidden />
                <span className="text-xs font-medium">Add photos</span>
                <input type="file" accept="image/*" multiple onChange={onFiles} className="sr-only" />
              </label>
            )}
          </div>
        </Section>

        <Section title="Category" error={show("category")}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {catalog.categories.map((c) => (
              <motion.button
                key={c.id}
                type="button"
                layout
                whileTap={{ scale: 0.95 }}
                onClick={() => pickCategory(c.id)}
                aria-pressed={categoryId === c.id}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors",
                  categoryId === c.id ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-400",
                )}
              >
                <CategoryIcon name={c.icon} className="size-5" />
                <span className="leading-tight">{c.label}</span>
              </motion.button>
            ))}
            {newCategory === null ? (
              <button
                type="button"
                onClick={() => setNewCategory("")}
                className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-2 py-3 text-xs font-medium text-ink-500 hover:border-ink-900 hover:text-ink-950"
              >
                <Plus className="size-5" aria-hidden />
                New category
              </button>
            ) : null}
          </div>
          <AnimatePresence>
            {newCategory !== null && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex gap-2">
                  <input
                    autoFocus
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value.slice(0, 32))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        createCategory();
                      }
                    }}
                    placeholder="e.g. Musical instruments"
                    className={cn(field, "h-11")}
                    aria-label="New category name"
                  />
                  <button type="button" onClick={createCategory} disabled={!newCategory.trim()} className={buttonClass("dark", "md")}>
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCategory(null)}
                    className={buttonClass("ghost", "md", "px-3")}
                    aria-label="Cancel"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink-500">It becomes available to everyone once your listing is published.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        <Section title="Title" error={show("title")}>
          <div className="relative">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder={category?.id === "food" ? "e.g. Jollof with chicken, serves 1" : "e.g. iPhone 12, 128GB, unlocked"}
              className={cn(field, "h-12 pr-16")}
              aria-label="Title"
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs text-ink-400 tabular">
              {title.length}/{TITLE_MAX}
            </span>
          </div>
        </Section>

        {/* Fields generated from the category schema */}
        <AnimatePresence mode="wait" initial={false}>
          {category && (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Section title={`${category.label} details`} hint="Buyers filter by these, so fill in what you can">
                <div className="grid gap-4 sm:grid-cols-2">
                  {category.attributes.map((a) => (
                    <AttributeField key={a.key} def={a} value={attrs[a.key]} onChange={(v) => setAttrs((s) => ({ ...s, [a.key]: v }))} />
                  ))}
                </div>
                <ExtraDetails rows={extra} onChange={setExtra} />
              </Section>
            </motion.div>
          )}
        </AnimatePresence>

        {category && !category.noCondition && (
          <Section title="Condition" error={show("condition")}>
            <div className="grid gap-2 sm:grid-cols-2">
              {conditions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCondition(c)}
                  aria-pressed={condition === c}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                    condition === c ? "border-ink-950 bg-surface" : "border-line-strong hover:border-ink-400",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2",
                      condition === c ? "border-ink-950" : "border-line-strong",
                    )}
                  >
                    {condition === c && <motion.span layoutId="cond-dot" className="size-2 rounded-full bg-ink-950" />}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-ink-950">{c}</span>
                    <span className="text-xs text-ink-500">{conditionHelp[c]}</span>
                  </span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Price" error={show("price")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyInput label={category?.noCondition ? "Price each" : "Your price"} value={price} onChange={setPrice} />
            <MoneyInput label="Original price" value={original} onChange={setOriginal} placeholder="Optional" />
            <label className="block">
              <span className="mb-1.5 block text-xs text-ink-500">Quantity</span>
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="1"
                className={cn(field, "h-12 tabular")}
              />
            </label>
          </div>
          {guide && (
            <p className="mt-3 text-xs text-ink-500">
              Similar items sell for{" "}
              <span className="font-medium text-ink-950">
                {formatCedi(guide.low)} to {formatCedi(guide.high)}
              </span>
              .
            </p>
          )}
        </Section>

        <Section title="Description" hint="Optional">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 800))}
            placeholder={
              category?.id === "food"
                ? "Ingredients, how it's packed, when it's ready"
                : "How old is it? Any marks or missing parts? What's included?"
            }
            rows={5}
            className={cn(field, "resize-none py-3 leading-6")}
            aria-label="Description"
          />
          <p className="mt-1.5 text-right text-xs text-ink-400 tabular">{description.length}/800</p>
        </Section>

        <Section title="Pickup spot" hint="Where buyers meet you">
          <div className="flex flex-wrap gap-2">
            {pickupSpots.map((p) => (
              <Pill key={p} active={pickup === p} onClick={() => setPickup(p)}>
                {p}
              </Pill>
            ))}
          </div>
        </Section>

        <Section title="Promote" hint="Optional" id="promote">
          <div className="grid gap-2 sm:grid-cols-3">
            {[{ id: "none", label: "No promotion", price: 0, reach: "Standard placement" }, ...BOOST_PLANS].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setBoost(p.id)}
                aria-pressed={boost === p.id}
                className={cn(
                  "rounded-xl border p-3.5 text-left transition-colors",
                  boost === p.id ? "border-ink-950 bg-surface" : "border-line-strong hover:border-ink-400",
                )}
              >
                <span className="flex items-center justify-between text-sm font-medium text-ink-950">
                  {p.label}
                  <span className="tabular">{p.price ? formatCedi(p.price) : "Free"}</span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-500">{p.reach}</span>
              </button>
            ))}
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-line-strong p-4">
            <input
              type="checkbox"
              checked={moveOut}
              onChange={(e) => setMoveOut(e.target.checked)}
              className="mt-0.5 size-[18px] accent-ink-950"
            />
            <span>
              <span className="block text-sm font-medium text-ink-950">Add to the {MOVE_OUT_SALE.name}</span>
              <span className="text-xs text-ink-500">Featured to everyone shopping the end-of-semester sale.</span>
            </span>
          </label>
        </Section>
      </div>

      {/* Preview and publish */}
      <aside className="lg:sticky lg:top-[132px] lg:self-start">
        <div className="rounded-2xl border border-line p-4">
          <p className="mb-3 text-xs font-medium text-ink-500">Live preview</p>
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-surface">
            <AnimatePresence mode="wait">
              {photos[0] ? (
                <motion.div
                  key={photos[0].slice(-40)}
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Image src={photos[0]} alt="" fill unoptimized className="object-cover" />
                </motion.div>
              ) : (
                <div className="grid h-full place-items-center text-ink-300">
                  {category ? <CategoryIcon name={category.icon} className="size-10" /> : <ImagePlus className="size-8" aria-hidden />}
                </div>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-3 space-y-0.5 px-0.5">
            <p className="text-[15px] font-semibold text-ink-950 tabular">{formatCedi(priceNum)}</p>
            <p className="truncate text-[13px] text-ink-700">{title || "Your item title"}</p>
            <p className="truncate text-xs text-ink-400">
              {[condition, category?.label, pickup].filter(Boolean).join(" · ")}
              {boost !== "none" && " · Promoted"}
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-2 px-1 text-sm">
          <div className="flex justify-between text-ink-500">
            <dt>You receive</dt>
            <dd className="font-medium text-ink-950 tabular">{formatCedi(priceNum)}</dd>
          </div>
          {plan && (
            <div className="flex justify-between text-ink-500">
              <dt>Promotion, {plan.label}</dt>
              <dd className="text-ink-950 tabular">{formatCedi(plan.price)}</dd>
            </div>
          )}
          <p className="text-xs leading-5 text-ink-400">The 4% buyer protection fee is paid by the buyer, not you.</p>
        </dl>

        <button type="submit" disabled={status !== "idle"} className={buttonClass("primary", "lg", "mt-5 w-full disabled:bg-maroon-700")}>
          {status === "publishing" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Publishing
            </>
          ) : status === "done" ? (
            <>
              <Check className="size-4" aria-hidden /> Listed
            </>
          ) : plan ? (
            `Publish and pay ${formatCedi(plan.price)}`
          ) : (
            "Publish listing"
          )}
        </button>
        <AnimatePresence>
          {touched && firstError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-center text-xs text-maroon-700"
            >
              {firstError}
            </motion.p>
          )}
        </AnimatePresence>
      </aside>
    </form>
  );
}

/** One input for a category attribute, chosen by the attribute's type. */
function AttributeField({ def, value, onChange }: { def: AttributeDef; value: AttrValue | undefined; onChange: (v: AttrValue) => void }) {
  if (def.type === "boolean") {
    const on = value === true;
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line-strong px-4 py-3 sm:col-span-1">
        <span className="text-sm text-ink-950">{def.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={def.label}
          onClick={() => onChange(!on)}
          className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-ink-950" : "bg-line-strong")}
        >
          <motion.span
            className="absolute top-0.5 size-5 rounded-full bg-canvas shadow-sm"
            animate={{ left: on ? 18 : 2 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
          />
        </button>
      </div>
    );
  }
  if (def.type === "select" && def.options) {
    return (
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-xs text-ink-500">{def.label}</span>
        <div className="flex flex-wrap gap-1.5">
          {def.options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(value === o ? "" : o)}
              aria-pressed={value === o}
              className={cn(
                "h-9 rounded-lg border px-3 text-[13px] transition-colors",
                value === o ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-900",
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-ink-500">{def.label}</span>
      <span className="relative block">
        <input
          value={value === undefined ? "" : String(value)}
          onChange={(e) =>
            onChange(def.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value.replace(/\D/g, ""))) : e.target.value)
          }
          inputMode={def.type === "number" ? "numeric" : undefined}
          placeholder={def.placeholder}
          className={cn(field, "h-11", def.unit && "pr-10")}
        />
        {def.unit && <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-ink-400">{def.unit}</span>}
      </span>
    </label>
  );
}

/** Seller-defined details for anything the schema doesn't cover. */
function ExtraDetails({ rows, onChange }: { rows: [string, string][]; onChange: (rows: [string, string][]) => void }) {
  return (
    <div className="mt-5">
      <AnimatePresence initial={false}>
        {rows.map(([k, v], i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-2 grid grid-cols-[1fr_1.4fr_auto] gap-2">
              <input
                value={k}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))}
                placeholder="Detail, e.g. Warranty"
                className={cn(field, "h-11 text-sm")}
                aria-label="Detail name"
              />
              <input
                value={v}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))}
                placeholder="e.g. 6 months left"
                className={cn(field, "h-11 text-sm")}
                aria-label="Detail value"
              />
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="grid size-11 place-items-center rounded-xl text-ink-500 hover:bg-surface hover:text-ink-950"
                aria-label="Remove detail"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => onChange([...rows, ["", ""]])}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-950 underline underline-offset-4"
      >
        <Plus className="size-3.5" aria-hidden /> Add your own detail
      </button>
    </div>
  );
}

function Section({
  title,
  hint,
  error,
  id,
  children,
}: {
  title: string;
  hint?: string;
  error?: string | false | null;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-36 py-7 first:pt-0">
      <div className="mb-3.5 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-semibold text-ink-950">{title}</h2>
        {error ? (
          <span className="text-xs text-maroon-700">{error}</span>
        ) : (
          hint && <span className="text-right text-xs text-ink-400">{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 rounded-xl border px-4 text-sm transition-colors",
        active ? "border-ink-950 bg-ink-950 text-canvas" : "border-line-strong text-ink-700 hover:border-ink-900",
      )}
    >
      {children}
    </button>
  );
}

function MoneyInput({
  label,
  value,
  onChange,
  placeholder = "0",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-ink-500">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] text-ink-500">GH₵</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder={placeholder}
          className={cn(field, "h-12 pl-14 tabular")}
        />
      </span>
    </label>
  );
}
